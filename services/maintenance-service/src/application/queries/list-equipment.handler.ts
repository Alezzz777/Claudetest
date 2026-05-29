import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListEquipmentQuery {
  constructor(
    public readonly workCenterId?: string,
    public readonly status?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface ListEquipmentResult {
  items: Array<{
    equipmentId: string;
    name: string;
    workCenterId: string;
    status: string;
    runtimeHours: number;
    tenantId: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListEquipmentQuery)
export class ListEquipmentHandler implements IQueryHandler<ListEquipmentQuery, ListEquipmentResult> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListEquipmentQuery): Promise<ListEquipmentResult> {
    const where: Record<string, unknown> = {};
    if (q.workCenterId) where['workCenterId'] = q.workCenterId;
    if (q.status) where['status'] = q.status;

    const [items, total] = await Promise.all([
      this.prisma.equipmentProjection.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.equipmentProjection.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        equipmentId: r.equipmentId,
        name: r.name,
        workCenterId: r.workCenterId,
        status: r.status,
        runtimeHours: r.runtimeHours,
        tenantId: r.tenantId,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
