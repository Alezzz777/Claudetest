import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetUserQuery {
  constructor(public readonly userId: string) {}
}

export interface UserReadModel {
  userId: string;
  email: string;
  displayName: string;
  roles: string[];
  tenantId: string;
  isActive: boolean;
}

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async execute(q: GetUserQuery): Promise<UserReadModel> {
    const row = await this.prisma.userProjection.findUnique({ where: { userId: q.userId } });
    if (!row) throw new NotFoundException(`User ${q.userId} not found`);
    return {
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      roles: row.roles as string[],
      tenantId: row.tenantId,
      isActive: row.isActive,
    };
  }
}
