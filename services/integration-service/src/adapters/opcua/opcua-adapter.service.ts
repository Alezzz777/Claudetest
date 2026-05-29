import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  OPCUAClient,
  ClientSession,
  DataValue,
  TimestampsToReturn,
  AttributeIds,
  ClientMonitoredItem,
  ClientSubscription,
  MonitoringParametersOptions,
  ReadValueIdOptions,
} from 'node-opcua';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { UnsMapper } from './uns-mapper';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OpcuaAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpcuaAdapterService.name);
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT = 10;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly unsMapper: UnsMapper,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const endpoint = process.env['OPCUA_ENDPOINT'];
    if (!endpoint) {
      this.logger.warn('OPCUA_ENDPOINT not configured — skipping OPC UA adapter');
      return;
    }
    await this.connect(endpoint);
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(endpoint: string): Promise<void> {
    try {
      this.client = OPCUAClient.create({ connectionStrategy: { maxRetry: 1 } });
      await this.client.connect(endpoint);
      this.logger.log(`OPC UA connected to ${endpoint}`);

      this.session = await this.client.createSession();
      this.logger.log('OPC UA session created');

      this.reconnectAttempts = 0;

      this.subscription = await this.session.createSubscription2({
        requestedPublishingInterval: 1000,
        requestedLifetimeCount: 100,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10,
      });

      const nodeIdsEnv = process.env['OPCUA_NODE_IDS'] ?? '';
      const nodeIds = nodeIdsEnv.split(',').map((s) => s.trim()).filter(Boolean);

      for (const nodeId of nodeIds) {
        const itemToMonitor: ReadValueIdOptions = {
          nodeId,
          attributeId: AttributeIds.Value,
        };
        const monitoringParameters: MonitoringParametersOptions = {
          samplingInterval: 500,
          discardOldest: true,
          queueSize: 10,
        };

        const monitoredItem = ClientMonitoredItem.create(
          this.subscription,
          itemToMonitor,
          monitoringParameters,
          TimestampsToReturn.Both,
        );

        monitoredItem.on('changed', (dataValue: DataValue) => {
          void this.handleDataChange(nodeId, dataValue);
        });
        monitoredItem.on('err', (err: Error) => {
          this.logger.error(`Monitored item error for ${nodeId}: ${err.message}`);
        });
      }

      this.client.on('close', () => {
        this.logger.warn('OPC UA connection closed — scheduling reconnect');
        this.scheduleReconnect(endpoint);
      });

      this.logger.log(`Subscribed to ${nodeIds.length} OPC UA nodes`);
    } catch (err) {
      this.logger.error(`OPC UA connect failed: ${err}`);
      this.scheduleReconnect(endpoint);
    }
  }

  private scheduleReconnect(endpoint: string): void {
    if (this.reconnectAttempts >= this.MAX_RECONNECT) {
      this.logger.error('Max OPC UA reconnect attempts reached');
      return;
    }
    const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, 30000);
    this.reconnectAttempts++;
    this.logger.warn(`Reconnecting to OPC UA in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      void this.connect(endpoint);
    }, delay);
  }

  private async handleDataChange(nodeId: string, dataValue: DataValue): Promise<void> {
    const mapping = this.unsMapper.map(nodeId);
    if (!mapping) {
      this.logger.warn(`No UNS mapping for nodeId: ${nodeId}`);
      return;
    }

    const unsPath = this.unsMapper.toKafkaTopic(mapping);
    const value = dataValue.value?.value;
    const timestamp = dataValue.sourceTimestamp?.toISOString() ?? new Date().toISOString();

    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
      source: `urn:mes:integration-service:OpcUA:${nodeId}`,
      aggregateId: mapping.device,
      aggregateType: 'Device',
      sequence: 1,
      data: {
        deviceId: mapping.device,
        unsPath,
        metric: mapping.metric,
        value,
        timestamp,
        protocol: 'OPC_UA',
      },
    });

    try {
      await this.kafkaProducer.publish(unsPath, mapping.device, JSON.stringify(envelope));
    } catch (err) {
      this.logger.error(`Failed to publish telemetry for ${nodeId}: ${err}`);
    }

    // Buffer in TelemetryBuffer for edge mode
    try {
      await this.prisma.telemetryBuffer.create({
        data: {
          id: uuidv4(),
          deviceId: mapping.device,
          metric: mapping.metric,
          value: typeof value === 'number' ? value : 0,
          protocol: 'OPC_UA',
          timestamp: new Date(timestamp),
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to buffer telemetry: ${err}`);
    }
  }

  private async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      if (this.subscription) await this.subscription.terminate();
      if (this.session) await this.session.close();
      if (this.client) await this.client.disconnect();
      this.logger.log('OPC UA disconnected');
    } catch (err) {
      this.logger.error(`Error during OPC UA disconnect: ${err}`);
    }
  }
}
