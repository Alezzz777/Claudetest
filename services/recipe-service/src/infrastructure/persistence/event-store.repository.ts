import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { EventEnvelope } from '@mes/shared';

/**
 * Event Store Repository — append-only log of domain events.
 * Saves events and outbox entries atomically for at-least-once delivery.
 */
@Injectable()
export class EventStoreRepository {
  private readonly logger = new Logger(EventStoreRepository.name);

  constructor(private readonly prisma: PrismaClient) {}

  async load(aggregateId: string): Promise<EventEnvelope[]> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map((r) => ({
      ...(r.data as Record<string, unknown>),
      id: r.id,
      type: r.type,
      aggregateId: r.aggregateId,
      aggregateType: r.aggregateType,
      sequence: r.sequence,
    }) as unknown as EventEnvelope);
  }

  async save(
    aggregateId: string,
    events: EventEnvelope[],
    expectedVersion: number,
  ): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency check
      const existing = await tx.eventStore.findMany({
        where: { aggregateId },
        orderBy: { sequence: 'desc' },
        take: 1,
      });
      const currentMaxSeq = existing.length > 0 ? existing[0]!.sequence : 0;
      if (currentMaxSeq !== expectedVersion) {
        throw new Error(
          `Concurrency conflict for aggregate ${aggregateId}: expected version ${expectedVersion}, got ${currentMaxSeq}`,
        );
      }

      // Write event store rows
      await tx.eventStore.createMany({
        data: events.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          type: e.type,
          sequence: e.sequence,
          data: e as unknown as Record<string, unknown>,
          createdAt: new Date(e.time),
        })),
      });

      // Write outbox rows
      await tx.outboxEvent.createMany({
        data: events.map((e) => ({
          topic: 'mes.recipe.versions',
          key: e.aggregateId,
          payload: e as unknown as Record<string, unknown>,
          sent: false,
          createdAt: new Date(e.time),
        })),
      });
    });

    this.logger.debug(`Saved ${events.length} event(s) for aggregate ${aggregateId}`);
  }
}
