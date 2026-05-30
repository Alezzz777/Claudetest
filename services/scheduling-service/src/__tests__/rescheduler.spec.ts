import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReschedulerService } from '../application/services/rescheduler.service';
import { ProductionScheduleAggregate } from '../domain/production-schedule.aggregate';

const t = (iso: string) => new Date(iso);

describe('ReschedulerService', () => {
  let eventStore: {
    load: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let prisma: {
    scheduleEntryProjection: {
      findMany: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let service: ReschedulerService;

  beforeEach(() => {
    eventStore = {
      load: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    prisma = {
      scheduleEntryProjection: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    };
    service = new ReschedulerService(eventStore as any, prisma as any);
  });

  describe('rescheduleForEquipmentDown()', () => {
    it('rescheduled affected entries and calls save for each schedule', async () => {
      // Build a schedule with one entry
      const agg = ProductionScheduleAggregate.create({
        name: 'Test',
        shiftDate: new Date('2026-01-15'),
        createdBy: 'test',
      });
      agg.insertOrder({
        orderId: 'order-1',
        workCenterId: 'wc-1',
        priority: 1,
        plannedStartAt: t('2026-01-15T10:00:00Z'),
        plannedEndAt: t('2026-01-15T12:00:00Z'),
      });
      const entryId = [...agg.entries.keys()][0]!;
      const events = agg.popUncommittedEvents();

      eventStore.load.mockResolvedValue(events);
      prisma.scheduleEntryProjection.findMany.mockResolvedValue([
        {
          entryId,
          scheduleId: agg.id,
          workCenterId: 'wc-1',
          status: 'PLANNED',
          plannedStartAt: t('2026-01-15T10:00:00Z'),
          plannedEndAt: t('2026-01-15T12:00:00Z'),
        },
      ]);

      await service.rescheduleForEquipmentDown('eq-1', 'wc-1', t('2026-01-15T09:00:00Z'));

      expect(eventStore.save).toHaveBeenCalledOnce();
    });

    it('does nothing when no affected entries', async () => {
      prisma.scheduleEntryProjection.findMany.mockResolvedValue([]);

      await service.rescheduleForEquipmentDown('eq-1', 'wc-1', new Date());

      expect(eventStore.save).not.toHaveBeenCalled();
    });
  });

  describe('advanceQueue()', () => {
    it('does not throw when next entry exists', async () => {
      prisma.scheduleEntryProjection.findFirst.mockResolvedValue({
        entryId: 'entry-1',
        orderId: 'order-2',
        workCenterId: 'wc-1',
        status: 'PLANNED',
      });

      await expect(service.advanceQueue('wc-1', 'order-1')).resolves.not.toThrow();
    });

    it('does not throw when queue is empty', async () => {
      prisma.scheduleEntryProjection.findFirst.mockResolvedValue(null);

      await expect(service.advanceQueue('wc-1', 'order-1')).resolves.not.toThrow();
    });
  });
});
