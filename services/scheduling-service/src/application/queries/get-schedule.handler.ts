import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetScheduleQuery { constructor(public readonly scheduleId: string) {} }
export interface ScheduleReadModel { scheduleId: string; name: string; shiftDate: string; entries: unknown[] }

@QueryHandler(GetScheduleQuery)
export class GetScheduleHandler implements IQueryHandler<GetScheduleQuery, ScheduleReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async execute(q: GetScheduleQuery): Promise<ScheduleReadModel> {
    const [schedule, entries] = await Promise.all([
      this.prisma.scheduleProjection.findUniqueOrThrow({ where: { scheduleId: q.scheduleId } }),
      this.prisma.scheduleEntryProjection.findMany({ where: { scheduleId: q.scheduleId }, orderBy: { priority: 'asc' } }),
    ]);
    return { scheduleId: schedule.scheduleId, name: schedule.name, shiftDate: schedule.shiftDate.toISOString(), entries };
  }
}
