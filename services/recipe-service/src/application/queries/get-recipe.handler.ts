import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/persistence/prisma.service';

export class GetRecipeQuery { constructor(public readonly recipeId: string, public readonly version?: string) {} }
export interface RecipeReadModel { recipeId: string; productCode: string; currentVersion: string; status: string; steps: unknown[] }

@QueryHandler(GetRecipeQuery)
export class GetRecipeHandler implements IQueryHandler<GetRecipeQuery, RecipeReadModel> {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  async execute(q: GetRecipeQuery): Promise<RecipeReadModel> {
    const row = await this.prisma.recipeProjection.findUnique({ where: { recipeId: q.recipeId } });
    if (!row) throw new NotFoundException(`Recipe ${q.recipeId} not found`);
    return { recipeId: row.recipeId, productCode: row.productCode, currentVersion: row.currentVersion, status: row.status, steps: row.steps as unknown[] };
  }
}
