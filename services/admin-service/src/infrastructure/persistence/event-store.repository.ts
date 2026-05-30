import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey, OutboxStatus } from '@mes/shared';
import type { OutboxEntry } from '@mes/shared';
import { PrismaService } from './prisma.service';

/**
 * Event Store Repository — append-only log of domain events.
 * Saves events and outbox entries in a single transaction for at-least-once delivery.
 */
@Injectable()
export class EventStoreRepository {
  private readonly logger = new Logger(EventStoreRepository.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Load all events for an aggregate, ordered by sequence ascending.
   */
  async load(aggregateId: string): Promise<EventEnvelope[]> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map((r) => r.payload as unknown as EventEnvelope);
  }

  /**
   * Persist events and outbox entries atomically.
   */
  async save(events: EventEnvelope[], outboxEntries: OutboxEntry[]): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.eventStore.createMany({
        data: events.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          eventType: e.type,
          sequence: e.sequence,
          payload: e as unknown as Record<string, unknown>,
          correlationId: e.correlationId,
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });

      if (outboxEntries.length > 0) {
        await tx.outbox.createMany({
          data: outboxEntries.map((o) => ({
            id: o.id,
            eventType: o.eventType,
            aggregateType: o.aggregateType,
            aggregateId: o.aggregateId,
            payload: o.payload,
            topic: o.topic,
            partitionKey: o.partitionKey,
            status: o.status,
            attempts: o.attempts,
            createdAt: o.createdAt,
            processedAt: o.processedAt,
            lastError: o.lastError,
          })),
        });
      }
    });

    this.logger.debug(`Saved ${events.length} event(s) for aggregate ${events[0]?.aggregateId}`);
  }
}
