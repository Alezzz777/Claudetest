import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListSchedulesQuery {
  constructor(
    public readonly shiftDate?: Date,
    public readonly status?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface ScheduleListItem {
  scheduleId: string;
  name: string;
  shiftDate: string;
  status: string;
  createdAt: string;
}

export interface PaginatedSchedules {
  items: ScheduleListItem[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListSchedulesQuery)
export class ListSchedulesHandler
  implements IQueryHandler<ListSchedulesQuery, PaginatedSchedules>
{
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListSchedulesQuery): Promise<PaginatedSchedules> {
    const where: Record<string, unknown> = {};
    if (q.shiftDate) where['shiftDate'] = q.shiftDate;
    if (q.status) where['status'] = q.status;

    const skip = (q.page - 1) * q.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.scheduleProjection.findMany({
        where,
        orderBy: { shiftDate: 'desc' },
        skip,
        take: q.pageSize,
      }),
      this.prisma.scheduleProjection.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        scheduleId: s.scheduleId,
        name: s.name,
        shiftDate: s.shiftDate.toISOString(),
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
