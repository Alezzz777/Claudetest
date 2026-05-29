import { Injectable, Inject, Logger, ConflictException } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey, MesEventType } from '@mes/shared';
import { PrismaService } from './prisma.service';
import { OutboxPublisher } from './outbox.publisher';
import { OutboxStatus } from '@mes/shared';

/**
 * Event Store Repository — append-only log of domain events.
 *
 * Optimistic concurrency: when saving, we check that the expected sequence
 * (currentSequence) matches the last stored sequence for the aggregate.
 * If another write has occurred in the meantime, we throw ConflictException.
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
   * Append new events + outbox rows in a single DB transaction.
   * Optimistic concurrency check is included.
   */
  async saveWithOutbox(
    aggregateId: string,
    expectedSequence: number,
    events: EventEnvelope[],
    outboxPublisher: OutboxPublisher,
  ): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency: check the current max sequence
      const latest = await tx.eventStore.findFirst({
        where: { aggregateId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });

      const actualSequence = latest?.sequence ?? 0;
      // expectedSequence is the sequence BEFORE these new events
      const baseSequence = expectedSequence - events.length;
      if (actualSequence !== baseSequence) {
        throw new ConflictException(
          `Optimistic concurrency conflict for aggregate ${aggregateId}: ` +
            `expected base sequence ${baseSequence}, got ${actualSequence}`,
        );
      }

      // Append events to event store
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

      // Write outbox rows for Kafka publishing
      await tx.outbox.createMany({
        data: events.map((e) => ({
          id: `${e.id}-outbox`,
          eventType: e.type,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          payload: e as unknown as Record<string, unknown>,
          topic: e.type,
          partitionKey: envelopeToKafkaKey(e),
          status: OutboxStatus.PENDING,
          attempts: 0,
          createdAt: new Date(),
          processedAt: null,
          lastError: null,
        })),
      });
    });

    this.logger.debug(
      `Saved ${events.length} event(s) for aggregate ${aggregateId}`,
    );
  }
}
