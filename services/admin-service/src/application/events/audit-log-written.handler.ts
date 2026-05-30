import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

/**
 * Idempotent audit log handler — persists every domain event as an audit record.
 * All services publish audit events to the admin.audit.log-written topic.
 * This gives a cross-service immutable audit trail.
 */
@Injectable()
export class AuditLogWrittenHandler {
  private readonly logger = new Logger(AuditLogWrittenHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope): Promise<void> {
    const { id: eventId } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;
    await this.prisma.$transaction([
      this.prisma.auditLog.create({
        data: { id: eventId, eventType: envelope.type, aggregateType: envelope.aggregateType, aggregateId: envelope.aggregateId, correlationId: envelope.correlationId, source: envelope.source, payload: envelope.data as unknown as Record<string, unknown>, occurredAt: new Date(envelope.time) },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);
    this.logger.debug(`Audit log written for event ${eventId} (${envelope.type})`);
  }
}
