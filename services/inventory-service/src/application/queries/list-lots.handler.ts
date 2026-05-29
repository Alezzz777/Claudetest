import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';
import { LotReadModel } from './get-lot-status.handler';

export class ListLotsQuery {
  constructor(
    public readonly materialCode?: string,
    public readonly status?: string,
    public readonly locationId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface PaginatedLots {
  items: LotReadModel[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListLotsQuery)
export class ListLotsHandler implements IQueryHandler<ListLotsQuery, PaginatedLots> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListLotsQuery): Promise<PaginatedLots> {
    const where = {
      ...(q.materialCode ? { materialCode: q.materialCode } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.locationId ? { locationId: q.locationId } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.lotProjection.findMany({
        where,
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.lotProjection.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        lotId: row.lotId,
        lotNo: row.lotNo,
        materialCode: row.materialCode,
        quantity: row.quantity,
        reservedQty: row.reservedQty,
        locationId: row.locationId,
        status: row.status,
        tenantId: row.tenantId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
