import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export class GetRecipeQuery {
  constructor(public readonly recipeId: string) {}
}

export interface RecipeReadModel {
  recipeId: string;
  productCode: string;
  description: string;
  status: string;
  currentVersion: string;
  createdAt: string;
  updatedAt: string;
}

@QueryHandler(GetRecipeQuery)
export class GetRecipeHandler implements IQueryHandler<GetRecipeQuery, RecipeReadModel> {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  async execute(q: GetRecipeQuery): Promise<RecipeReadModel> {
    const row = await this.prisma.recipeProjection.findUnique({
      where: { recipeId: q.recipeId },
    });
    if (!row) throw new NotFoundException(`Recipe ${q.recipeId} not found`);

    return {
      recipeId: row.recipeId,
      productCode: row.productCode,
      description: row.description,
      status: row.status,
      currentVersion: row.currentVersion,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
