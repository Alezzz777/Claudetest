import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { EventEnvelope, MesEventType } from '@mes/shared';
import { AuditLogWrittenHandler } from '../../application/events/audit-log-written.handler';
import { UserProjectionHandler } from '../../application/events/user-projection.handler';

const USER_EVENT_TYPES = new Set<string>([
  MesEventType.ADMIN_USER_CREATED,
  MesEventType.ADMIN_USER_ROLE_ASSIGNED,
  MesEventType.ADMIN_USER_DEACTIVATED,
]);

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer!: Consumer;

  constructor(
    private readonly auditHandler: AuditLogWrittenHandler,
    private readonly userProjectionHandler: UserProjectionHandler,
  ) {}

  async onModuleInit(): Promise<void> {
    const kafka = new Kafka({
      clientId: 'admin-service',
      brokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    });
    this.consumer = kafka.consumer({ groupId: 'admin-service-audit' });
    await this.consumer.connect();

    // Subscribe to all MES topics using regex for cross-service audit trail
    await this.consumer.subscribe({ topics: /^mes\./, fromBeginning: false });

    await this.consumer.run({ eachMessage: this.handle.bind(this) });
    this.logger.log('Kafka consumer connected and subscribed to mes.* topics');
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.disconnect();
  }

  private async handle({ message }: EachMessagePayload): Promise<void> {
    if (!message.value) return;
    try {
      const envelope = JSON.parse(message.value.toString()) as EventEnvelope;
      // All events go to the audit trail
      await this.auditHandler.handle(envelope);
      // User-related events update the read model projection
      if (USER_EVENT_TYPES.has(envelope.type)) {
        await this.userProjectionHandler.handleIdempotent(envelope);
      }
    } catch (err) {
      this.logger.error(`Failed to handle Kafka message: ${err}`);
    }
  }
}
