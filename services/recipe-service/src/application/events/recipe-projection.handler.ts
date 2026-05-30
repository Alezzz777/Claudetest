import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { IdempotentEventHandler, EventEnvelope, MesEventType } from '@mes/shared';
import { RecipeCacheService } from '../../infrastructure/cache/recipe-cache.service';
import type {
  RecipeCreatedPayload,
  RecipeVersionPublishedPayload,
  RecipeObsoletedPayload,
} from '../../domain/recipe.aggregate';

/**
 * Builds and maintains read-side projections for recipes.
 * Extends IdempotentEventHandler to guarantee exactly-once processing.
 */
@Injectable()
export class RecipeProjectionHandler extends IdempotentEventHandler<unknown> {
  private readonly logger = new Logger(RecipeProjectionHandler.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly cache: RecipeCacheService,
  ) {
    super();
  }

  async isAlreadyProcessed(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { eventId } });
    return row !== null;
  }

  async markAsProcessed(eventId: string): Promise<void> {
    await this.prisma.processedEvent.upsert({
      where: { eventId },
      create: { eventId, processedAt: new Date() },
      update: {},
    });
  }

  async handle(event: EventEnvelope<unknown>): Promise<void> {
    switch (event.type) {
      case MesEventType.RECIPE_CREATED:
        await this.handleRecipeCreated(event as EventEnvelope<RecipeCreatedPayload>);
        break;
      case MesEventType.RECIPE_VERSION_PUBLISHED:
        await this.handleRecipeVersionPublished(event as EventEnvelope<RecipeVersionPublishedPayload>);
        break;
      case MesEventType.RECIPE_OBSOLETED:
        await this.handleRecipeObsoleted(event as EventEnvelope<RecipeObsoletedPayload>);
        break;
      default:
        this.logger.warn(`Unhandled event type: ${event.type}`);
    }
  }

  private async handleRecipeCreated(event: EventEnvelope<RecipeCreatedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.recipeProjection.upsert({
      where: { recipeId: d.recipeId },
      create: {
        recipeId: d.recipeId,
        productCode: d.productCode,
        description: d.description,
        status: 'DRAFT',
        currentVersion: '0.0.0',
        createdAt: new Date(d.createdAt),
        updatedAt: new Date(d.createdAt),
      },
      update: {},
    });
    this.logger.debug(`Recipe projection created: ${d.recipeId}`);
  }

  private async handleRecipeVersionPublished(event: EventEnvelope<RecipeVersionPublishedPayload>): Promise<void> {
    const d = event.data;

    await this.prisma.$transaction([
      this.prisma.recipeVersionProjection.upsert({
        where: { recipeId_version: { recipeId: d.recipeId, version: d.version } },
        create: {
          recipeId: d.recipeId,
          version: d.version,
          productCode: d.productCode,
          steps: d.steps as unknown as Record<string, unknown>[],
          publishedBy: d.publishedBy,
          publishedAt: new Date(d.publishedAt),
        },
        update: {},
      }),
      this.prisma.recipeProjection.update({
        where: { recipeId: d.recipeId },
        data: {
          currentVersion: d.version,
          status: 'APPROVED',
          updatedAt: new Date(d.publishedAt),
        },
      }),
    ]);

    // Invalidate cache for this version
    this.cache.invalidate(`${d.recipeId}:${d.version}`);
    this.cache.invalidate(`${d.productCode}:latest`);

    this.logger.debug(`Recipe version projection created: ${d.recipeId} v${d.version}`);
  }

  private async handleRecipeObsoleted(event: EventEnvelope<RecipeObsoletedPayload>): Promise<void> {
    const d = event.data;
    await this.prisma.recipeProjection.update({
      where: { recipeId: d.recipeId },
      data: { status: 'OBSOLETE', updatedAt: new Date(d.obsoletedAt) },
    });
    this.logger.debug(`Recipe projection obsoleted: ${d.recipeId}`);
  }
}
