import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { LotProjectionHandler } from '../../application/events/lot-moved.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;

  constructor(private readonly lotProjectionHandler: LotProjectionHandler) {}

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'inventory-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = kafka.consumer({ groupId: 'inventory-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        MesEventType.INVENTORY_LOT_CREATED,
        MesEventType.INVENTORY_LOT_MOVED,
        MesEventType.INVENTORY_LOT_CONSUMED,
        MesEventType.INVENTORY_RESERVATION_CREATED,
        MesEventType.INVENTORY_RESERVATION_FULFILLED,
      ],
      fromBeginning: false,
    });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }

  private async handle({ message }: EachMessagePayload) {
    if (!message.value) return;
    const e = JSON.parse(message.value.toString()) as EventEnvelope;
    await this.lotProjectionHandler.handleIdempotent(e);
  }
}
