import { Injectable } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey } from '@mes/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class EventStoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async load(aggregateId: string): Promise<EventEnvelope[]> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map((r) => r.payload as unknown as EventEnvelope);
  }

  async save(aggregateId: string, events: EventEnvelope[], expectedVersion: number): Promise<void> {
    if (events.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      // Optimistic concurrency check
      const count = await tx.eventStore.count({ where: { aggregateId } });
      if (count !== expectedVersion) {
        throw new Error(`Concurrency conflict for aggregate ${aggregateId}: expected version ${expectedVersion}, got ${count}`);
      }

      await tx.eventStore.createMany({
        data: events.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          eventType: e.type,
          sequence: e.sequence,
          payload: e as unknown as Record<string, unknown>,
          correlationId: e.correlationId ?? null,
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });

      await tx.outbox.createMany({
        data: events.map((e) => ({
          id: `${e.id}-outbox`,
          eventType: e.type,
          aggregateType: e.aggregateType,
          aggregateId: e.aggregateId,
          payload: e as unknown as Record<string, unknown>,
          topic: e.type,
          partitionKey: envelopeToKafkaKey(e),
          status: 'PENDING',
          attempts: 0,
          createdAt: new Date(),
          processedAt: null,
          lastError: null,
        })),
      });
    });
  }
}
