import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { DeviceProjectionHandler } from '../../application/events/device-online.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;

  constructor(private readonly deviceProjectionHandler: DeviceProjectionHandler) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: 'integration-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = kafka.consumer({ groupId: 'integration-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [MesEventType.INTEGRATION_DEVICE_ONLINE, MesEventType.INTEGRATION_DEVICE_OFFLINE, 'mes.integration.telemetry'],
      fromBeginning: false,
    });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle({ topic, message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    const envelope = JSON.parse(message.value.toString()) as EventEnvelope;

    if (
      topic === MesEventType.INTEGRATION_DEVICE_ONLINE ||
      topic === MesEventType.INTEGRATION_DEVICE_OFFLINE ||
      topic === 'mes.integration.telemetry'
    ) {
      await this.deviceProjectionHandler.handle(envelope as EventEnvelope<any>);
    }
  }
}
