import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { MeasurementRecordedHandler } from '../../application/events/measurement-recorded.handler';
import type { QualityMeasurementRecordedPayload } from '../../domain/quality-plan.aggregate';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;

  constructor(private readonly measurementHandler: MeasurementRecordedHandler) {}

  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'quality-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'quality-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [MesEventType.QUALITY_MEASUREMENT_RECORDED], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }

  async onModuleDestroy() { await this.consumer.disconnect(); }

  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
    if (topic === MesEventType.QUALITY_MEASUREMENT_RECORDED) {
      await this.measurementHandler.handle(envelope as EventEnvelope<QualityMeasurementRecordedPayload>);
    }
  }
}
