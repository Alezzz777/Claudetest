import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { DeviceOnlineHandler } from '../../application/events/device-online.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly deviceOnlineHandler: DeviceOnlineHandler) {}
  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'integration-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'integration-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [MesEventType.INTEGRATION_DEVICE_ONLINE], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }
  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const e = JSON.parse(message.value.toString()) as EventEnvelope;
    if (topic === MesEventType.INTEGRATION_DEVICE_ONLINE) await this.deviceOnlineHandler.handle(e as any);
  }
}
