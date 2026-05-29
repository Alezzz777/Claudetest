import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { connect as mqttConnect, MqttClient } from 'mqtt';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { SparkplugDecoder } from './sparkplug-decoder';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MqttSparkplugAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttSparkplugAdapterService.name);
  private client: MqttClient | null = null;
  private readonly decoder = new SparkplugDecoder();
  private readonly devicePresence = new Map<string, boolean>();

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const brokerUrl = process.env['MQTT_BROKER_URL'];
    if (!brokerUrl) {
      this.logger.warn('MQTT_BROKER_URL not configured — skipping MQTT/Sparkplug B adapter');
      return;
    }
    await this.connectMqtt(brokerUrl);
  }

  async onModuleDestroy(): Promise<void> {
    this.client?.end(true);
  }

  private async connectMqtt(brokerUrl: string): Promise<void> {
    return new Promise((resolve) => {
      this.client = mqttConnect(brokerUrl, {
        clientId: `mes-integration-${uuidv4()}`,
        clean: true,
        reconnectPeriod: 5000,
      });

      this.client.on('connect', () => {
        this.logger.log(`MQTT connected to ${brokerUrl}`);
        this.client!.subscribe('spBv1.0/#', { qos: 1 }, (err) => {
          if (err) {
            this.logger.error(`MQTT subscribe error: ${err.message}`);
          } else {
            this.logger.log('Subscribed to spBv1.0/#');
          }
        });
        resolve();
      });

      this.client.on('message', (topic: string, payload: Buffer) => {
        void this.handleMessage(topic, payload);
      });

      this.client.on('error', (err) => {
        this.logger.error(`MQTT error: ${err.message}`);
      });

      this.client.on('offline', () => {
        this.logger.warn('MQTT client offline');
      });
    });
  }

  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const parsed = this.decoder.parseTopic(topic);
    if (!parsed) return;

    const { groupId, messageType, edgeNodeId, deviceId } = parsed;
    const decoded = this.decoder.decode(payload);
    const effectiveDeviceId = deviceId ?? edgeNodeId;

    switch (messageType) {
      case 'NBIRTH':
      case 'DBIRTH': {
        this.devicePresence.set(effectiveDeviceId, true);
        const envelope = createEventEnvelope({
          type: MesEventType.INTEGRATION_DEVICE_ONLINE,
          source: `urn:mes:integration-service:SparkplugB:${groupId}`,
          aggregateId: effectiveDeviceId,
          aggregateType: 'Device',
          sequence: 1,
          data: {
            deviceId: effectiveDeviceId,
            groupId,
            edgeNodeId,
            metrics: decoded.metrics,
            timestamp: new Date(decoded.timestamp).toISOString(),
            protocol: 'SPARKPLUG_B',
          },
        });
        await this.kafkaProducer.publish(
          'mes.integration.telemetry',
          effectiveDeviceId,
          JSON.stringify(envelope),
        );
        await this.upsertDeviceProjection(effectiveDeviceId, 'ONLINE', 'SPARKPLUG_B');
        break;
      }
      case 'NDEATH':
      case 'DDEATH': {
        this.devicePresence.set(effectiveDeviceId, false);
        const envelope = createEventEnvelope({
          type: MesEventType.INTEGRATION_DEVICE_OFFLINE,
          source: `urn:mes:integration-service:SparkplugB:${groupId}`,
          aggregateId: effectiveDeviceId,
          aggregateType: 'Device',
          sequence: 1,
          data: {
            deviceId: effectiveDeviceId,
            groupId,
            timestamp: new Date(decoded.timestamp).toISOString(),
            protocol: 'SPARKPLUG_B',
          },
        });
        await this.kafkaProducer.publish(
          'mes.integration.telemetry',
          effectiveDeviceId,
          JSON.stringify(envelope),
        );
        await this.upsertDeviceProjection(effectiveDeviceId, 'OFFLINE', 'SPARKPLUG_B');
        break;
      }
      case 'NDATA':
      case 'DDATA': {
        const envelope = createEventEnvelope({
          type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
          source: `urn:mes:integration-service:SparkplugB:${groupId}`,
          aggregateId: effectiveDeviceId,
          aggregateType: 'Device',
          sequence: 1,
          data: {
            deviceId: effectiveDeviceId,
            metrics: decoded.metrics,
            timestamp: new Date(decoded.timestamp).toISOString(),
            protocol: 'SPARKPLUG_B',
          },
        });
        await this.kafkaProducer.publish(
          `mes.uns.${groupId}.telemetry`,
          effectiveDeviceId,
          JSON.stringify(envelope),
        );

        // Buffer metrics
        for (const metric of decoded.metrics) {
          try {
            await this.prisma.telemetryBuffer.create({
              data: {
                id: uuidv4(),
                deviceId: effectiveDeviceId,
                metric: metric.name,
                value: typeof metric.value === 'number' ? metric.value : 0,
                protocol: 'SPARKPLUG_B',
                timestamp: new Date(metric.timestamp),
              },
            });
          } catch (err) {
            this.logger.warn(`Failed to buffer telemetry: ${err}`);
          }
        }
        break;
      }
    }
  }

  private async upsertDeviceProjection(deviceId: string, status: string, protocol: string): Promise<void> {
    try {
      await this.prisma.deviceProjection.upsert({
        where: { deviceId },
        update: { status, updatedAt: new Date(), lastSeenAt: new Date() },
        create: { deviceId, status, protocol, lastSeenAt: new Date() },
      });
    } catch (err) {
      this.logger.warn(`Failed to upsert device projection: ${err}`);
    }
  }
}
