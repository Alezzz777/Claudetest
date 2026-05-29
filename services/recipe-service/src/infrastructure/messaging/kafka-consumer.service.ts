import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { RecipePublishedHandler } from '../../application/events/recipe-published.handler';
import type { RecipeVersionPublishedPayload } from '../../domain/recipe.aggregate';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly handler: RecipePublishedHandler) {}
  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'recipe-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'recipe-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [MesEventType.RECIPE_VERSION_PUBLISHED], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }
  private async handle({ message }: EachMessagePayload) {
    if (!message.value) return;
    await this.handler.handle(JSON.parse(message.value.toString()) as EventEnvelope<RecipeVersionPublishedPayload>);
  }
}
