import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { ProductionOrderReadModel } from './get-production-order.handler';

// ─── Query ────────────────────────────────────────────────────────────────────

export class ListProductionOrdersQuery {
  constructor(
    public readonly tenantId?: string,
    public readonly status?: string,
    public readonly workCenterId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

// ─── Read model ───────────────────────────────────────────────────────────────

export interface PaginatedOrders {
  items: ProductionOrderReadModel[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@QueryHandler(ListProductionOrdersQuery)
export class ListProductionOrdersHandler
  implements IQueryHandler<ListProductionOrdersQuery, PaginatedOrders>
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async execute(query: ListProductionOrdersQuery): Promise<PaginatedOrders> {
    const { tenantId, status, workCenterId, page, pageSize } = query;

    const where: Record<string, unknown> = {};
    if (tenantId) where['tenantId'] = tenantId;
    if (status) where['status'] = status;
    if (workCenterId) where['workCenterId'] = workCenterId;

    const skip = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.productionOrderProjection.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.productionOrderProjection.count({ where }),
    ]);

    const items: ProductionOrderReadModel[] = rows.map((row) => ({
      orderId: row.orderId,
      orderNo: row.orderNo,
      recipeId: row.recipeId,
      recipeVersion: row.recipeVersion,
      status: row.status,
      plannedQty: row.plannedQty,
      completedQty: row.completedQty,
      scrapQty: row.scrapQty,
      workCenterId: row.workCenterId,
      scheduledStartAt: row.scheduledStartAt.toISOString(),
      scheduledEndAt: row.scheduledEndAt.toISOString(),
      actualStartAt: row.actualStartAt?.toISOString() ?? null,
      actualEndAt: row.actualEndAt?.toISOString() ?? null,
      oee: row.oee ?? null,
      updatedAt: row.updatedAt.toISOString(),
    }));

    return { items, total, page, pageSize };
  }
}
