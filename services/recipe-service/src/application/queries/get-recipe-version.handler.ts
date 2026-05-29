import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { RecipeCacheService } from '../../infrastructure/cache/recipe-cache.service';
import type { RecipeStep } from '../../domain/recipe.aggregate';

export class GetRecipeVersionQuery {
  constructor(
    public readonly recipeId: string,
    public readonly version: string,
  ) {}
}

export interface RecipeVersionReadModel {
  id: string;
  recipeId: string;
  version: string;
  productCode: string;
  steps: RecipeStep[];
  publishedBy: string;
  publishedAt: string;
}

@QueryHandler(GetRecipeVersionQuery)
export class GetRecipeVersionHandler implements IQueryHandler<GetRecipeVersionQuery, RecipeVersionReadModel> {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly cache: RecipeCacheService,
  ) {}

  async execute(q: GetRecipeVersionQuery): Promise<RecipeVersionReadModel> {
    const cacheKey = `${q.recipeId}:${q.version}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        id: cacheKey,
        recipeId: q.recipeId,
        version: cached.version,
        productCode: cached.productCode,
        steps: cached.steps,
        publishedBy: '',
        publishedAt: '',
      };
    }

    const row = await this.prisma.recipeVersionProjection.findUnique({
      where: { recipeId_version: { recipeId: q.recipeId, version: q.version } },
    });
    if (!row) throw new NotFoundException(`Recipe ${q.recipeId} version ${q.version} not found`);

    const steps = row.steps as unknown as RecipeStep[];
    this.cache.set(cacheKey, {
      steps,
      version: row.version,
      productCode: row.productCode,
    });

    return {
      id: row.id,
      recipeId: row.recipeId,
      version: row.version,
      productCode: row.productCode,
      steps,
      publishedBy: row.publishedBy,
      publishedAt: row.publishedAt.toISOString(),
    };
  }
}
