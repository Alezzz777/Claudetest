import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { EquipmentRuntimeUpdatedHandler } from '../../application/events/equipment-runtime-updated.handler';
import type { EquipmentRuntimeUpdatedPayload } from '../../domain/equipment.aggregate';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly runtimeHandler: EquipmentRuntimeUpdatedHandler) {}

  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'maintenance-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'maintenance-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({ topics: [MesEventType.MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED, MesEventType.INTEGRATION_TELEMETRY_RECEIVED], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }

  private async handle({ topic, message }: EachMessagePayload) {
    if (!message.value) return;
    const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
    if (topic === MesEventType.MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED) {
      await this.runtimeHandler.handle(envelope as EventEnvelope<EquipmentRuntimeUpdatedPayload>);
    }
  }
}
