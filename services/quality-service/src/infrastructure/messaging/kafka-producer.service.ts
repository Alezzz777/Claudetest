import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer!: Producer;

  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'quality-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.producer = kafka.producer({ idempotent: true });
    await this.producer.connect();
  }

  async onModuleDestroy() { await this.producer.disconnect(); }

  async publish(topic: string, key: string, value: string): Promise<void> {
    await this.producer.send({ topic, messages: [{ key, value }] });
  }

  async disconnect(): Promise<void> {
    await this.producer.disconnect();
  }
}
