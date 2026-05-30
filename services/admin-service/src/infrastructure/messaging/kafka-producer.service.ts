import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';

export interface PublishParams {
  topic: string;
  key: string;
  value: string;
  headers?: Record<string, string>;
}

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer!: Producer;

  async onModuleInit(): Promise<void> {
    const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');
    const ssl = process.env['KAFKA_SSL'] === 'true';
    const sasl = process.env['KAFKA_USERNAME']
      ? {
          mechanism: (process.env['KAFKA_SASL_MECHANISM'] ?? 'scram-sha-256') as 'scram-sha-256' | 'scram-sha-512',
          username: process.env['KAFKA_USERNAME'],
          password: process.env['KAFKA_PASSWORD'] ?? '',
        }
      : undefined;
    const kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'admin-service',
      brokers,
      ssl,
      sasl,
    });
    this.producer = kafka.producer({ idempotent: true, maxInFlightRequests: 5 });
    await this.producer.connect();
    this.logger.log('Kafka producer connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.producer.disconnect();
  }

  async publish(params: PublishParams): Promise<void> {
    const record: ProducerRecord = {
      topic: params.topic,
      messages: [{ key: params.key, value: params.value, headers: params.headers }],
    };
    await this.producer.send(record);
  }
}
