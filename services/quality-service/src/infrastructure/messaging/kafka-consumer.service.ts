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
    const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
    const ssl = process.env['KAFKA_SSL'] === 'true';
    const sasl = process.env['KAFKA_USERNAME']
      ? {
          mechanism: (process.env['KAFKA_SASL_MECHANISM'] ?? 'scram-sha-256') as 'scram-sha-256' | 'scram-sha-512',
          username: process.env['KAFKA_USERNAME'],
          password: process.env['KAFKA_PASSWORD'] ?? '',
        }
      : undefined;
    const kafka = new Kafka({ clientId: 'quality-service', brokers, ssl, sasl });
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
