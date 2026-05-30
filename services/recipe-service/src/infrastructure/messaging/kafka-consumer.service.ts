import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope } from '@mes/shared';
import { RecipeProjectionHandler } from '../../application/events/recipe-projection.handler';

const RECIPE_TOPIC = 'mes.recipe.versions';

/**
 * Kafka consumer that subscribes to the recipe versions topic and
 * routes events to the RecipeProjectionHandler for idempotent processing.
 */
@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(private readonly projectionHandler: RecipeProjectionHandler) {}

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
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'recipe-service',
      brokers,
      ssl,
      sasl,
    });
    this.consumer = kafka.consumer({ groupId: 'recipe-service-projection-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [RECIPE_TOPIC], fromBeginning: false });
    await this.consumer.run({ eachMessage: (payload) => this.handle(payload) });
    this.logger.log(`Kafka consumer subscribed to ${RECIPE_TOPIC}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
    this.logger.log('Kafka consumer disconnected');
  }

  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    try {
      const envelope = JSON.parse(message.value.toString()) as EventEnvelope<unknown>;
      await this.projectionHandler.handleIdempotent(envelope);
    } catch (err) {
      this.logger.error(`Failed to process message: ${String(err)}`);
    }
  }
}
