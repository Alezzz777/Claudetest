import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import {
  OPCUAClient,
  ClientSession,
  AttributeIds,
  DataValue,
  TimestampsToReturn,
  ClientMonitoredItem,
  ClientSubscription,
  MonitoringParametersOptions,
  ReadValueIdOptions,
} from 'node-opcua';
import { KafkaProducerService } from '../../infrastructure/messaging/kafka-producer.service';
import { createEventEnvelope, MesEventType } from '@mes/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * OPC UA Adapter — connects to an OPC UA server (PLC / SCADA), subscribes to
 * data changes on configured node IDs, and publishes telemetry events to Kafka.
 *
 * Uses OPC UA subscriptions for push-based data change notifications (preferred
 * over polling) to minimize latency and server load.
 *
 * UNS topic mapping: OPC UA node path → enterprise/site/area/line/cell/device/variable
 */
@Injectable()
export class OpcUaAdapterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OpcUaAdapterService.name);
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private subscription: ClientSubscription | null = null;

  /** Nodes to monitor — loaded from configuration / DB in production */
  private readonly monitoredNodes: Array<{ nodeId: string; unsPath: string; equipmentId: string }> = [
    { nodeId: 'ns=2;s=PLC1.RunHours', unsPath: 'acme/plant-01/assembly/line-A/cell-1/plc-1/run-hours', equipmentId: 'equip-plc-001' },
    { nodeId: 'ns=2;s=PLC1.CycleCount', unsPath: 'acme/plant-01/assembly/line-A/cell-1/plc-1/cycle-count', equipmentId: 'equip-plc-001' },
    { nodeId: 'ns=2;s=PLC1.Fault', unsPath: 'acme/plant-01/assembly/line-A/cell-1/plc-1/fault', equipmentId: 'equip-plc-001' },
  ];

  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async onModuleInit(): Promise<void> {
    const endpointUrl = process.env['OPCUA_ENDPOINT_URL'] ?? 'opc.tcp://localhost:4840';

    this.client = OPCUAClient.create({
      endpointMustExist: false,
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 10,
        maxDelay: 30000,
      },
    });

    try {
      await this.client.connect(endpointUrl);
      this.logger.log(`OPC UA client connected to ${endpointUrl}`);

      this.session = await this.client.createSession();
      this.logger.log('OPC UA session created');

      await this.setupSubscriptions();
    } catch (err) {
      this.logger.error(`Failed to connect to OPC UA server at ${endpointUrl}: ${err}`);
      // In edge mode, keep retrying — don't crash the service
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.subscription) await this.subscription.terminate();
      if (this.session) await this.session.close();
      if (this.client) await this.client.disconnect();
      this.logger.log('OPC UA client disconnected');
    } catch (err) {
      this.logger.error(`Error during OPC UA shutdown: ${err}`);
    }
  }

  private async setupSubscriptions(): Promise<void> {
    if (!this.session) return;

    this.subscription = await this.session.createSubscription2({
      requestedPublishingInterval: 1000,      // ms
      requestedLifetimeCount: 100,
      requestedMaxKeepAliveCount: 10,
      maxNotificationsPerPublish: 100,
      publishingEnabled: true,
      priority: 10,
    });

    for (const node of this.monitoredNodes) {
      const itemToMonitor: ReadValueIdOptions = {
        nodeId: node.nodeId,
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
        void this.handleDataChange(node, dataValue);
      });
    }

    this.logger.log(`Subscribed to ${this.monitoredNodes.length} OPC UA node(s)`);
  }

  private async handleDataChange(
    node: { nodeId: string; unsPath: string; equipmentId: string },
    dataValue: DataValue,
  ): Promise<void> {
    const value = dataValue.value?.value;
    if (value === undefined || value === null) return;

    const envelope = createEventEnvelope({
      type: MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
      source: `urn:mes:integration-service:OpcUaAdapter:${node.nodeId}`,
      aggregateId: node.equipmentId,
      aggregateType: 'Equipment',
      sequence: 1,
      data: {
        equipmentId: node.equipmentId,
        nodeId: node.nodeId,
        unsPath: node.unsPath,
        value,
        dataType: dataValue.value?.dataType?.toString() ?? 'Unknown',
        sourceTimestamp: dataValue.sourceTimestamp?.toISOString() ?? new Date().toISOString(),
        serverTimestamp: dataValue.serverTimestamp?.toISOString() ?? new Date().toISOString(),
        quality: dataValue.statusCode?.toString() ?? 'Good',
        protocol: 'OPC_UA',
      },
    });

    try {
      await this.kafkaProducer.publish(
        MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
        `Equipment:${node.equipmentId}`,
        JSON.stringify(envelope),
      );
    } catch (err) {
      this.logger.error(`Failed to publish telemetry for node ${node.nodeId}: ${err}`);
    }
  }
}
