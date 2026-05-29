import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListUsersQuery {
  constructor(
    public readonly tenantId?: string,
    public readonly page = 1,
    public readonly pageSize = 20,
  ) {}
}

export interface ListUsersResult {
  data: Array<{
    userId: string;
    email: string;
    displayName: string;
    roles: string[];
    tenantId: string;
    isActive: boolean;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery, ListUsersResult> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: ListUsersQuery): Promise<ListUsersResult> {
    const where = q.tenantId ? { tenantId: q.tenantId } : {};
    const skip = (q.page - 1) * q.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.userProjection.findMany({ where, skip, take: q.pageSize, orderBy: { createdAt: 'asc' } }),
      this.prisma.userProjection.count({ where }),
    ]);

    return {
      data: rows.map((r) => ({
        userId: r.userId,
        email: r.email,
        displayName: r.displayName,
        roles: r.roles as string[],
        tenantId: r.tenantId,
        isActive: r.isActive,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
