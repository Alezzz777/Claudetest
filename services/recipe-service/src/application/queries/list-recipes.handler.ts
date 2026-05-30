import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { RecipeReadModel } from './get-recipe.handler';

export class ListRecipesQuery {
  constructor(
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
    public readonly status?: string,
  ) {}
}

export interface ListRecipesResult {
  items: RecipeReadModel[];
  total: number;
  page: number;
  pageSize: number;
}

@QueryHandler(ListRecipesQuery)
export class ListRecipesHandler implements IQueryHandler<ListRecipesQuery, ListRecipesResult> {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(q: ListRecipesQuery): Promise<ListRecipesResult> {
    const where = q.status ? { status: q.status } : {};
    const skip = (q.page - 1) * q.pageSize;

    const [rows, total] = await Promise.all([
      this.prisma.recipeProjection.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: q.pageSize,
      }),
      this.prisma.recipeProjection.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        recipeId: row.recipeId,
        productCode: row.productCode,
        description: row.description,
        status: row.status,
        currentVersion: row.currentVersion,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }
}
