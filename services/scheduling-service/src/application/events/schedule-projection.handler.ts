import { Injectable, Logger } from '@nestjs/common';
import { EventEnvelope, IdempotentEventHandler, MesEventType } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ReschedulerService } from '../services/rescheduler.service';
import type {
  ScheduleCreatedPayload,
  ScheduleOrderInsertedPayload,
  ScheduleEntryRescheduledPayload,
  ScheduleEntryCancelledPayload,
  SchedulePublishedPayload,
} from '../../domain/production-schedule.aggregate';

@Injectable()
export class ScheduleProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(ScheduleProjectionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rescheduler: ReschedulerService,
  ) {
    super();
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    return row !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } });
  }

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    switch (event.type) {
      case MesEventType.SCHEDULE_CREATED:
      case 'scheduling.schedule.created': {
        const d = event.data as ScheduleCreatedPayload;
        await this.prisma.scheduleProjection.upsert({
          where: { scheduleId: d.scheduleId },
          update: {},
          create: {
            scheduleId: d.scheduleId,
            name: d.name,
            shiftDate: new Date(d.shiftDate),
            status: 'DRAFT',
          },
        });
        this.logger.debug(`Schedule projection created: ${d.scheduleId}`);
        break;
      }

      case MesEventType.SCHEDULE_ORDER_INSERTED:
      case 'scheduling.order.scheduled': {
        const d = event.data as ScheduleOrderInsertedPayload;
        await this.prisma.scheduleEntryProjection.upsert({
          where: { entryId: d.entryId },
          update: {
            priority: d.priority,
            plannedStartAt: new Date(d.plannedStartAt),
            plannedEndAt: new Date(d.plannedEndAt),
          },
          create: {
            entryId: d.entryId,
            scheduleId: d.scheduleId,
            orderId: d.orderId,
            workCenterId: d.workCenterId,
            priority: d.priority,
            plannedStartAt: new Date(d.plannedStartAt),
            plannedEndAt: new Date(d.plannedEndAt),
            status: 'PLANNED',
          },
        });
        this.logger.debug(`Schedule entry projection upserted: ${d.entryId}`);
        break;
      }

      case MesEventType.SCHEDULE_ORDER_RESCHEDULED:
      case 'scheduling.entry.rescheduled': {
        const d = event.data as ScheduleEntryRescheduledPayload;
        await this.prisma.scheduleEntryProjection.update({
          where: { entryId: d.entryId },
          data: {
            plannedStartAt: new Date(d.newStartAt),
            plannedEndAt: new Date(d.newEndAt),
          },
        });
        this.logger.debug(`Schedule entry rescheduled in projection: ${d.entryId}`);
        break;
      }

      case 'scheduling.entry.cancelled': {
        const d = event.data as ScheduleEntryCancelledPayload;
        await this.prisma.scheduleEntryProjection.update({
          where: { entryId: d.entryId },
          data: { status: 'CANCELLED' },
        });
        this.logger.debug(`Schedule entry cancelled in projection: ${d.entryId}`);
        break;
      }

      case MesEventType.SCHEDULE_PUBLISHED:
      case 'scheduling.schedule.published': {
        const d = event.data as SchedulePublishedPayload;
        await this.prisma.scheduleProjection.update({
          where: { scheduleId: d.scheduleId },
          data: { status: 'PUBLISHED' },
        });
        this.logger.debug(`Schedule published in projection: ${d.scheduleId}`);
        break;
      }

      case MesEventType.MAINTENANCE_EQUIPMENT_FAILED: {
        const d = event.data as { equipmentId: string; workCenterId: string; failedAt: string };
        await this.rescheduler.rescheduleForEquipmentDown(
          d.equipmentId,
          d.workCenterId,
          new Date(d.failedAt),
        );
        break;
      }

      case MesEventType.PRODUCTION_OPERATION_COMPLETED: {
        const d = event.data as { workCenterId: string; orderId: string };
        await this.rescheduler.advanceQueue(d.workCenterId, d.orderId);
        break;
      }

      default:
        this.logger.debug(`Unhandled event type: ${event.type}`);
    }
  }
}
