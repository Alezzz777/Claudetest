import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListWorkOrdersQuery {
  constructor(
    public readonly equipmentId?: string,
    public readonly status?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface ListWorkOrdersResult {
  items: Array<{
    workOrderId: string;
    equipmentId: string;
    workOrderNo: string;
    type: string;
    status: string;
    description: string;
    assignedTo: string | null;
    createdAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListWorkOrdersQuery)
export class ListWorkOrdersHandler implements IQueryHandler<ListWorkOrdersQuery, ListWorkOrdersResult> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListWorkOrdersQuery): Promise<ListWorkOrdersResult> {
    const where: Record<string, unknown> = {};
    if (q.equipmentId) where['equipmentId'] = q.equipmentId;
    if (q.status) where['status'] = q.status;

    const [items, total] = await Promise.all([
      this.prisma.workOrderProjection.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.workOrderProjection.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        workOrderId: r.workOrderId,
        equipmentId: r.equipmentId,
        workOrderNo: r.workOrderNo,
        type: r.type,
        status: r.status,
        description: r.description,
        assignedTo: r.assignedTo ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
