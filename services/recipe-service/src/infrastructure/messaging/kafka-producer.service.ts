import { Injectable, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

export interface PublishParams {
  topic: string;
  key: string;
  payload: object;
}

/**
 * Kafka producer with lazy initialization (connects on first publish).
 */
@Injectable()
export class KafkaProducerService {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer | null = null;

  private async getProducer(): Promise<Producer> {
    if (!this.producer) {
      const kafka = new Kafka({
        clientId: process.env['KAFKA_CLIENT_ID'] ?? 'recipe-service',
        brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
      });
      this.producer = kafka.producer({
        allowAutoTopicCreation: false,
        idempotent: true,
      });
      await this.producer.connect();
      this.logger.log('Kafka producer connected');
    }
    return this.producer;
  }

  async publish(params: PublishParams): Promise<void> {
    const producer = await this.getProducer();
    await producer.send({
      topic: params.topic,
      messages: [{ key: params.key, value: JSON.stringify(params.payload) }],
    });
  }

  async publishBatch(params: PublishParams[]): Promise<void> {
    if (params.length === 0) return;
    const producer = await this.getProducer();
    const topicMessages: Record<string, { key: string; value: string }[]> = {};
    for (const p of params) {
      if (!topicMessages[p.topic]) topicMessages[p.topic] = [];
      topicMessages[p.topic]!.push({ key: p.key, value: JSON.stringify(p.payload) });
    }
    await producer.sendBatch({
      topicMessages: Object.entries(topicMessages).map(([topic, messages]) => ({
        topic,
        messages,
      })),
    });
  }

  async disconnect(): Promise<void> {
    if (this.producer) {
      await this.producer.disconnect();
      this.producer = null;
    }
  }
}
