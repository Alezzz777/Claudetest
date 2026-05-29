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
    await this.prisma.$transaction(async (tx) => {
      const maxRow = await tx.eventStore.findFirst({
        where: { aggregateId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const currentVersion = maxRow?.sequence ?? 0;
      if (currentVersion !== expectedVersion - events.length) {
        throw new Error(
          `Concurrency conflict for aggregate ${aggregateId}: expected version ${
            expectedVersion - events.length
          }, got ${currentVersion}`,
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
          causationId: e.causationId ?? null,
          createdAt: new Date(e.time),
        })),
      });

      await tx.outboxEvent.createMany({
        data: events.map((e) => ({
          topic: e.type,
          partitionKey: envelopeToKafkaKey(e),
          payload: e as unknown as Record<string, unknown>,
          sent: false,
          createdAt: new Date(),
        })),
      });
    });
  }
}
