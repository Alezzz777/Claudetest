import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

// ─── Query ────────────────────────────────────────────────────────────────────

export class GetProductionOrderQuery {
  constructor(public readonly orderId: string) {}
}

// ─── Read model (projection shape) ───────────────────────────────────────────

export interface ProductionOrderReadModel {
  orderId: string;
  orderNo: string;
  recipeId: string;
  recipeVersion: string;
  status: string;
  plannedQty: number;
  completedQty: number;
  scrapQty: number;
  workCenterId: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  actualStartAt: string | null;
  actualEndAt: string | null;
  oee: number | null;
  updatedAt: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

@QueryHandler(GetProductionOrderQuery)
export class GetProductionOrderHandler
  implements IQueryHandler<GetProductionOrderQuery, ProductionOrderReadModel>
{
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Queries the materialized projection table — NOT the event stream.
   * This is the CQRS read side: fast denormalized read model.
   */
  async execute(query: GetProductionOrderQuery): Promise<ProductionOrderReadModel> {
    const row = await this.prisma.productionOrderProjection.findUnique({
      where: { orderId: query.orderId },
    });

    if (!row) {
      throw new NotFoundException(
        `Production order ${query.orderId} not found`,
      );
    }

    return {
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
    };
  }
}
