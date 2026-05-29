import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { ScheduleOrderInsertedHandler } from '../../application/events/schedule-order-inserted.handler';
import type { ScheduleOrderInsertedPayload } from '../../domain/production-schedule.aggregate';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly handler: ScheduleOrderInsertedHandler) {}
  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'scheduling-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'scheduling-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [MesEventType.SCHEDULE_ORDER_INSERTED, MesEventType.PRODUCTION_ORDER_COMPLETED], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }
  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const e = JSON.parse(message.value.toString()) as EventEnvelope;
    if (topic === MesEventType.SCHEDULE_ORDER_INSERTED) await this.handler.handle(e as EventEnvelope<ScheduleOrderInsertedPayload>);
  }
}
