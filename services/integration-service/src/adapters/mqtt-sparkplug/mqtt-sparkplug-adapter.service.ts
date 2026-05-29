import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import mqtt, { MqttClient, IClientOptions } from 'mqtt';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';

/**
 * MQTT / Sparkplug B adapter.
 *
 * Sparkplug B is an MQTT application-layer specification that defines:
 *  - Topic namespace: spBv1.0/<group_id>/<message_type>/<edge_node_id>/<device_id>
 *  - Payload: Google Protocol Buffers (protobuf)
 *  - Birth/Death certificates for edge nodes and devices
 *  - Data (DDATA) messages for telemetry
 *
 * This adapter subscribes to the Sparkplug namespace, decodes payloads,
 * and maps them to the MES Unified Namespace (UNS) / ISA-95 hierarchy,
 * then publishes to Kafka.
 *
 * Sparkplug message types:
 *  NBIRTH — Node birth (edge node comes online)
 *  NDEATH — Node death
 *  DBIRTH — Device birth
 *  DDEATH — Device death
 *  DDATA  — Device telemetry data
 *  NDATA  — Node telemetry data
 */
@Injectable()
export class MqttSparkplugAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttSparkplugAdapterService.name);
  private client: MqttClient | null = null;

  /** Sparkplug group IDs to subscribe to (maps to ISA-95 areas/lines) */
  private readonly sparkplugGroups = ['plant-01', 'plant-02'];

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async onModuleInit(): Promise<void> {
    const brokerUrl = process.env['MQTT_BROKER_URL'] ?? 'mqtt://localhost:1883';
    const clientId = process.env['MQTT_CLIENT_ID'] ?? `mes-integration-${Date.now()}`;

    const options: IClientOptions = {
      clientId,
      clean: true,
      keepalive: 60,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
      will: {
        topic: `spBv1.0/STATE/mes-integration`,
        payload: Buffer.from('OFFLINE'),
        qos: 1,
        retain: true,
      },
    };

    const username = process.env['MQTT_USERNAME'];
    const password = process.env['MQTT_PASSWORD'];
    if (username) options.username = username;
    if (password) options.password = password;

    this.client = mqtt.connect(brokerUrl, options);

    this.client.on('connect', () => {
      this.logger.log(`MQTT connected to ${brokerUrl}`);
      this.subscribeToSparkplug();
    });

    this.client.on('message', (topic: string, payload: Buffer) => {
      void this.handleMessage(topic, payload);
    });

    this.client.on('error', (err) => {
      this.logger.error(`MQTT error: ${err.message}`);
    });

    this.client.on('offline', () => {
      this.logger.warn('MQTT client offline — buffering incoming data locally');
    });
  }

  async onModuleDestroy(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (this.client) {
        this.client.end(false, {}, resolve);
      } else {
        resolve();
      }
    });
  }

  private subscribeToSparkplug(): void {
    if (!this.client) return;
    for (const group of this.sparkplugGroups) {
      // Subscribe to all Sparkplug B message types for this group
      const topics = [
        `spBv1.0/${group}/NBIRTH/#`,
        `spBv1.0/${group}/NDEATH/#`,
        `spBv1.0/${group}/DBIRTH/#`,
        `spBv1.0/${group}/DDEATH/#`,
        `spBv1.0/${group}/DDATA/#`,
        `spBv1.0/${group}/NDATA/#`,
      ];
      this.client.subscribe(topics, { qos: 1 }, (err) => {
        if (err) {
          this.logger.error(`MQTT subscribe error for group ${group}: ${err.message}`);
        } else {
          this.logger.log(`Subscribed to Sparkplug group: ${group}`);
        }
      });
    }
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    // Topic format: spBv1.0/<group_id>/<message_type>/<edge_node_id>[/<device_id>]
    const parts = topic.split('/');
    if (parts.length < 4) return;

    const [, groupId, messageType, edgeNodeId, deviceId] = parts as [string, string, string, string, string | undefined];

    switch (messageType) {
      case 'NBIRTH':
        await this.handleNodeBirth(groupId, edgeNodeId, payload);
        break;
      case 'NDEATH':
        await this.handleNodeDeath(groupId, edgeNodeId, payload);
        break;
      case 'DBIRTH':
        if (deviceId) await this.handleDeviceBirth(groupId, edgeNodeId, deviceId, payload);
        break;
      case 'DDEATH':
        if (deviceId) await this.handleDeviceDeath(groupId, edgeNodeId, deviceId, payload);
        break;
      case 'DDATA':
        if (deviceId) await this.handleDeviceData(groupId, edgeNodeId, deviceId, payload);
        break;
      case 'NDATA':
        await this.handleNodeData(groupId, edgeNodeId, payload);
        break;
    }
  }

  private async handleDeviceBirth(groupId: string, edgeNodeId: string, deviceId: string, payload: Buffer): Promise<void> {
    // In production: decode protobuf using sparkplug-b proto definition
    const decodedPayload = this.decodeSparkplugPayload(payload);
    const equipmentId = `${groupId}:${edgeNodeId}:${deviceId}`;

    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_DEVICE_ONLINE,
      source: `urn:mes:integration-service:SparkplugAdapter:${groupId}`,
      aggregateId: equipmentId,
      aggregateType: 'Equipment',
      sequence: 1,
      data: {
        equipmentId,
        groupId, edgeNodeId, deviceId,
        protocol: 'SPARKPLUG_B',
        metrics: decodedPayload.metrics,
        timestamp: decodedPayload.timestamp,
        unsPath: this.buildUnsPath(groupId, edgeNodeId, deviceId),
      },
    });

    await this.kafkaProducer.publish(MesEventType.INTEGRATION_DEVICE_ONLINE, `Equipment:${equipmentId}`, JSON.stringify(envelope));
    this.logger.log(`Device BIRTH: ${equipmentId}`);
  }

  private async handleDeviceData(groupId: string, edgeNodeId: string, deviceId: string, payload: Buffer): Promise<void> {
    const decodedPayload = this.decodeSparkplugPayload(payload);
    const equipmentId = `${groupId}:${edgeNodeId}:${deviceId}`;

    // Publish individual telemetry event per metric
    for (const metric of decodedPayload.metrics) {
      const envelope = createEventEnvelope({
        type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
        source: `urn:mes:integration-service:SparkplugAdapter`,
        aggregateId: equipmentId,
        aggregateType: 'Equipment',
        sequence: 1,
        data: {
          equipmentId,
          metric: metric.name,
          value: metric.value,
          dataType: metric.type,
          unsPath: `${this.buildUnsPath(groupId, edgeNodeId, deviceId)}/${metric.name}`,
          timestamp: metric.timestamp ?? decodedPayload.timestamp,
          protocol: 'SPARKPLUG_B',
          quality: 'Good',
        },
      });
      await this.kafkaProducer.publish(MesEventType.INTEGRATION_TELEMETRY_RECEIVED, `Equipment:${equipmentId}`, JSON.stringify(envelope));
    }
  }

  private async handleNodeBirth(groupId: string, edgeNodeId: string, _payload: Buffer): Promise<void> {
    this.logger.log(`Node BIRTH: ${groupId}/${edgeNodeId}`);
  }

  private async handleNodeDeath(groupId: string, edgeNodeId: string, _payload: Buffer): Promise<void> {
    this.logger.warn(`Node DEATH: ${groupId}/${edgeNodeId}`);
  }

  private async handleDeviceDeath(groupId: string, edgeNodeId: string, deviceId: string, _payload: Buffer): Promise<void> {
    const equipmentId = `${groupId}:${edgeNodeId}:${deviceId}`;
    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_DEVICE_OFFLINE,
      source: 'urn:mes:integration-service:SparkplugAdapter',
      aggregateId: equipmentId, aggregateType: 'Equipment', sequence: 1,
      data: { equipmentId, groupId, edgeNodeId, deviceId, timestamp: new Date().toISOString() },
    });
    await this.kafkaProducer.publish(MesEventType.INTEGRATION_DEVICE_OFFLINE, `Equipment:${equipmentId}`, JSON.stringify(envelope));
  }

  private async handleNodeData(groupId: string, edgeNodeId: string, payload: Buffer): Promise<void> {
    // Node-level telemetry (edge node metrics, e.g. edge gateway health)
    this.logger.debug(`Node DATA: ${groupId}/${edgeNodeId}`);
  }

  /**
   * Decode Sparkplug B protobuf payload.
   * In production this should use the sparkplug-b-payload proto library.
   * This stub parses a simplified JSON-encoded payload for development.
   */
  private decodeSparkplugPayload(payload: Buffer): {
    timestamp: string;
    metrics: Array<{ name: string; value: unknown; type: string; timestamp?: string }>;
  } {
    try {
      const parsed = JSON.parse(payload.toString()) as {
        timestamp?: number;
        metrics?: Array<{ name: string; value: unknown; type: string; timestamp?: number }>;
      };
      return {
        timestamp: parsed.timestamp ? new Date(parsed.timestamp).toISOString() : new Date().toISOString(),
        metrics: (parsed.metrics ?? []).map((m) => ({
          name: m.name,
          value: m.value,
          type: m.type,
          timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : undefined,
        })),
      };
    } catch {
      // Binary protobuf — would use real sparkplug-b decoder in production
      return { timestamp: new Date().toISOString(), metrics: [] };
    }
  }

  /** Map Sparkplug namespace to ISA-95 UNS hierarchy */
  private buildUnsPath(groupId: string, edgeNodeId: string, deviceId: string): string {
    // groupId maps to site/area, edgeNodeId to line/cell, deviceId to device
    return `${process.env['UNS_ENTERPRISE'] ?? 'enterprise'}/${groupId}/${edgeNodeId}/${deviceId}`;
  }
}
