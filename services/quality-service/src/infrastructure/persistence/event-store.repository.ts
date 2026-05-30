import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope, envelopeToKafkaKey } from '@mes/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class EventStoreRepository {
  private readonly logger = new Logger(EventStoreRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async load(aggregateId: string): Promise<EventEnvelope[]> {
    const rows = await this.prisma.eventStore.findMany({
      where: { aggregateId },
      orderBy: { sequence: 'asc' },
    });
    return rows.map((r) => r.payload as unknown as EventEnvelope);
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

      await tx.eventStore.createMany({
        data: events.map((e) => ({
          id: e.id,
          aggregateId: e.aggregateId,
          aggregateType: e.aggregateType,
          eventType: e.type,
          sequence: e.sequence,
          payload: e as unknown as Record<string, unknown>,
          correlationId: e.correlationId ?? null,
          createdAt: new Date(e.time),
        })),
      });

      await tx.outboxEvent.createMany({
        data: events.map((e) => ({
          topic: e.type,
          partitionKey: envelopeToKafkaKey(e),
          payload: e as unknown as Record<string, unknown>,
          sent: false,
          createdAt: new Date(e.time),
        })),
      });
    });

    this.logger.debug(`Saved ${events.length} event(s) for aggregate ${aggregateId}`);
  }
}
