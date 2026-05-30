import { Injectable, Logger } from '@nestjs/common';
import { EventStoreRepository } from '../../infrastructure/persistence/event-store.repository';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ProductionScheduleAggregate } from '../../domain/production-schedule.aggregate';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class ReschedulerService {
  private readonly logger = new Logger(ReschedulerService.name);

  constructor(
    private readonly eventStore: EventStoreRepository,
    private readonly prisma: PrismaService,
  ) {}

  async rescheduleForEquipmentDown(
    equipmentId: string,
    workCenterId: string,
    downAt: Date,
  ): Promise<void> {
    const affectedEntries = await this.prisma.scheduleEntryProjection.findMany({
      where: {
        workCenterId,
        status: 'PLANNED',
        plannedStartAt: { gte: downAt },
      },
    });

    if (affectedEntries.length === 0) {
      this.logger.log(
        `No affected entries for equipment ${equipmentId} / workCenter ${workCenterId}`,
      );
      return;
    }

    // Group by scheduleId
    const scheduleIds = [...new Set(affectedEntries.map((e) => e.scheduleId))];
    let totalRescheduled = 0;

    for (const scheduleId of scheduleIds) {
      const events = await this.eventStore.load(scheduleId);
      if (events.length === 0) continue;

      const aggregate = ProductionScheduleAggregate.rehydrate(events);
      const scheduleEntries = affectedEntries.filter((e) => e.scheduleId === scheduleId);

      for (const entry of scheduleEntries) {
        const newStartAt = new Date(entry.plannedStartAt.getTime() + FOUR_HOURS_MS);
        const newEndAt = new Date(entry.plannedEndAt.getTime() + FOUR_HOURS_MS);
        aggregate.rescheduleEntry({
          entryId: entry.entryId,
          newStartAt,
          newEndAt,
          reason: `Equipment ${equipmentId} went down at ${downAt.toISOString()}`,
        });
        totalRescheduled++;
      }

      const uncommitted = aggregate.popUncommittedEvents();
      await this.eventStore.save(scheduleId, uncommitted, aggregate.sequence);
    }

    this.logger.log(
      `Rescheduled ${totalRescheduled} entries due to equipment ${equipmentId} down`,
    );
  }

  async advanceQueue(workCenterId: string, completedOrderId: string): Promise<void> {
    const nextEntry = await this.prisma.scheduleEntryProjection.findFirst({
      where: { workCenterId, status: 'PLANNED' },
      orderBy: { priority: 'asc' },
    });

    if (!nextEntry) {
      this.logger.log(
        `No next PLANNED entry for workCenter ${workCenterId} after order ${completedOrderId} completed`,
      );
      return;
    }

    this.logger.log(
      `Next entry in queue for workCenter ${workCenterId}: entry ${nextEntry.entryId} (orderId: ${nextEntry.orderId})`,
    );
  }
}
