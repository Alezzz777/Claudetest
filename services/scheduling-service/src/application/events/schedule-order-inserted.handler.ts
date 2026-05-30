import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { EventEnvelope } from '@mes/shared';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import type { ScheduleOrderInsertedPayload } from '../../domain/production-schedule.aggregate';

@Injectable()
export class ScheduleOrderInsertedHandler {
  private readonly logger = new Logger(ScheduleOrderInsertedHandler.name);
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async handle(envelope: EventEnvelope<ScheduleOrderInsertedPayload>): Promise<void> {
    const { id: eventId, data } = envelope;
    const already = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    if (already) return;
    await this.prisma.$transaction([
      this.prisma.scheduleEntryProjection.upsert({
        where: { entryId: data.entryId },
        update: { priority: data.priority, plannedStartAt: new Date(data.plannedStartAt), plannedEndAt: new Date(data.plannedEndAt) },
        create: { entryId: data.entryId, scheduleId: data.scheduleId, orderId: data.orderId, workCenterId: data.workCenterId, priority: data.priority, plannedStartAt: new Date(data.plannedStartAt), plannedEndAt: new Date(data.plannedEndAt), status: 'PLANNED' },
      }),
      this.prisma.processedEvent.create({ data: { eventId, processedAt: new Date() } }),
    ]);
    this.logger.debug(`Schedule entry ${data.entryId} upserted into projection`);
  }
}
