import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListNonConformancesQuery {
  constructor(
    public readonly orderId?: string,
    public readonly status?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface NonConformanceItem {
  ncId: string;
  orderId: string;
  lotId?: string | null;
  description: string;
  status: string;
  raisedBy: string;
  raisedAt: Date;
  closedAt?: Date | null;
}

export interface PaginatedNonConformances {
  items: NonConformanceItem[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListNonConformancesQuery)
export class ListNonConformancesHandler implements IQueryHandler<ListNonConformancesQuery, PaginatedNonConformances> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(query: ListNonConformancesQuery): Promise<PaginatedNonConformances> {
    const where: Record<string, unknown> = {};
    if (query.orderId) where['orderId'] = query.orderId;
    if (query.status) where['status'] = query.status;

    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      this.prisma.nonConformanceProjection.findMany({
        where,
        skip,
        take: query.pageSize,
        orderBy: { raisedAt: 'desc' },
      }),
      this.prisma.nonConformanceProjection.count({ where }),
    ]);

    return {
      items: items.map((r) => ({
        ncId: r.ncId,
        orderId: r.orderId,
        lotId: r.lotId,
        description: r.description,
        status: r.status,
        raisedBy: r.raisedBy,
        raisedAt: r.raisedAt,
        closedAt: r.closedAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
