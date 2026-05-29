import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { AuditLogWrittenHandler } from '../../application/events/audit-log-written.handler';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer!: Consumer;
  constructor(private readonly auditHandler: AuditLogWrittenHandler) {}
  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'admin-service', brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',') });
    this.consumer = kafka.consumer({ groupId: 'admin-service-audit-group' });
    await this.consumer.connect();
    // Subscribe to all domain topics to build cross-service audit trail
    await this.consumer.subscribe({ topics: [MesEventType.ADMIN_AUDIT_LOG_WRITTEN, MesEventType.ADMIN_USER_CREATED, MesEventType.ADMIN_USER_ROLE_ASSIGNED], fromBeginning: false });
    await this.consumer.run({ eachMessage: this.handle.bind(this) });
  }
  async onModuleDestroy() { await this.consumer.disconnect(); }
  private async handle({ message }: EachMessagePayload) {
    if (!message.value) return;
    await this.auditHandler.handle(JSON.parse(message.value.toString()) as EventEnvelope);
  }
}
