import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer!: Producer;
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
    const kafka = new Kafka({ clientId: 'maintenance-service', brokers, ssl, sasl });
    this.producer = kafka.producer({ idempotent: true });
    await this.producer.connect();
  }
  async onModuleDestroy() { await this.producer.disconnect(); }
  async publish(topic: string, key: string, value: string): Promise<void> {
    await this.producer.send({ topic, messages: [{ key, value }] });
  }
}
