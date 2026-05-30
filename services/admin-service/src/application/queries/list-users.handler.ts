import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class ListUsersQuery {
  constructor(
    public readonly tenantId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}

export interface UserListItem {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  isActive: boolean;
  tenantId: string;
}

export interface PaginatedUsers {
  items: UserListItem[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListUsersQuery)
export class ListUsersHandler implements IQueryHandler<ListUsersQuery> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(query: ListUsersQuery): Promise<PaginatedUsers> {
    const where = query.tenantId ? { tenantId: query.tenantId } : {};
    const [items, total] = await Promise.all([
      this.prisma.userProjection.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.userProjection.count({ where }),
    ]);
    return {
      items: items.map((u) => ({
        userId: u.userId,
        email: u.email,
        displayName: u.displayName,
        roles: u.roles as string[],
        isActive: u.isActive,
        tenantId: u.tenantId,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
