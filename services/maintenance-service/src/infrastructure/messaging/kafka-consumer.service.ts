import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { MaintenanceProjectionHandler } from '../../application/events/equipment-runtime-updated.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly projectionHandler: MaintenanceProjectionHandler) {}

  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'maintenance-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'maintenance-service-group' });
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: [
        MesEventType.MAINTENANCE_EQUIPMENT_RUNTIME_UPDATED,
        MesEventType.MAINTENANCE_WORK_ORDER_CREATED,
        MesEventType.MAINTENANCE_WORK_ORDER_COMPLETED,
        MesEventType.INTEGRATION_TELEMETRY_RECEIVED,
        'maintenance.equipment.created',
        'maintenance.equipment.down',
        'maintenance.equipment.restored',
        'maintenance.work-order.started',
        'maintenance.work-order.cancelled',
      ],
      fromBeginning: false,
    });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }

  private async handle({ message }: EachMessagePayload) {
    if (!message.value) return;
    const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
    await this.projectionHandler.handleIdempotent(envelope);
  }
}
