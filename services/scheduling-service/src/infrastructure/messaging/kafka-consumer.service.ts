import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope } from '@mes/shared';
import { ScheduleProjectionHandler } from '../../application/events/schedule-projection.handler';

const SCHEDULING_TOPIC = 'mes.scheduling.orders';
const MAINTENANCE_TOPIC = 'mes.maintenance.equipment';
const PRODUCTION_TOPIC = 'mes.production.orders';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(private readonly projectionHandler: ScheduleProjectionHandler) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: 'scheduling-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = kafka.consumer({ groupId: 'scheduling-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [SCHEDULING_TOPIC, MAINTENANCE_TOPIC, PRODUCTION_TOPIC],
      fromBeginning: false,
    });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
    this.logger.log('Kafka consumer started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    try {
      const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
      await this.projectionHandler.handleIdempotent(envelope);
    } catch (err) {
      this.logger.error('Error handling Kafka message', err);
    }
  }
}
