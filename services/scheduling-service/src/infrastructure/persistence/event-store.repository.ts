import { Injectable, Logger, ConflictException } from '@nestjs/common';
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
      const latest = await tx.eventStore.findFirst({
        where: { aggregateId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const actualSequence = latest?.sequence ?? 0;
      const baseSequence = expectedVersion - events.length;
      if (actualSequence !== baseSequence) {
        throw new ConflictException(
          `Optimistic concurrency conflict for aggregate ${aggregateId}: ` +
            `expected base sequence ${baseSequence}, got ${actualSequence}`,
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
          correlationId: e.correlationId,
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });

      await tx.outboxEvent.createMany({
        data: events.map((e) => ({
          topic: 'mes.scheduling.orders',
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
