import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { ProductionOrderStartedHandler } from '../../application/events/production-order-started.handler';
import type { ProductionOrderStartedPayload } from '../../domain/production-order.aggregate';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(
    private readonly orderStartedHandler: ProductionOrderStartedHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: process.env['KAFKA_CLIENT_ID'] ?? 'production-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = kafka.consumer({
      groupId: process.env['KAFKA_GROUP_ID'] ?? 'production-service-group',
    });
    await this.consumer.connect();

    // Subscribe to topics relevant to this service
    await this.consumer.subscribe({
      topics: [
        MesEventType.PRODUCTION_ORDER_STARTED,
        MesEventType.PRODUCTION_ORDER_COMPLETED,
        MesEventType.SCHEDULE_ORDER_RESCHEDULED,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({ eachMessage: this.handleMessage.bind(this) });
    this.logger.log('Kafka consumer running');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const { topic, message } = payload;
    if (!message.value) return;

    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(message.value.toString()) as EventEnvelope;
    } catch {
      this.logger.error(`Failed to parse message on topic ${topic}`);
      return;
    }

    switch (topic) {
      case MesEventType.PRODUCTION_ORDER_STARTED:
        await this.orderStartedHandler.handle(
          envelope as EventEnvelope<ProductionOrderStartedPayload>,
        );
        break;
      default:
        this.logger.debug(`Unhandled topic ${topic}`);
    }
  }
}
