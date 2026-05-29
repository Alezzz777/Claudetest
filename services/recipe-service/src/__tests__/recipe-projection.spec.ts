import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecipeProjectionHandler } from '../application/events/recipe-projection.handler';
import { RecipeCacheService } from '../infrastructure/cache/recipe-cache.service';
import { MesEventType, createEventEnvelope } from '@mes/shared';
import type {
  RecipeCreatedPayload,
  RecipeVersionPublishedPayload,
  RecipeObsoletedPayload,
} from '../domain/recipe.aggregate';

function makePrisma() {
  return {
    processedEvent: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    recipeProjection: {
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    recipeVersionProjection: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(async (ops: unknown[]) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') return ops({} as any);
    }),
  };
}

describe('RecipeProjectionHandler', () => {
  let handler: RecipeProjectionHandler;
  let prisma: ReturnType<typeof makePrisma>;
  let cache: RecipeCacheService;

  beforeEach(() => {
    prisma = makePrisma();
    cache = new RecipeCacheService();
    handler = new RecipeProjectionHandler(prisma as any, cache);
  });

  it('should handle RECIPE_CREATED and upsert recipe projection', async () => {
    const payload: RecipeCreatedPayload = {
      recipeId: 'r-001',
      productCode: 'PC-001',
      description: 'Test',
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.RECIPE_CREATED,
      source: 'test',
      aggregateId: 'r-001',
      aggregateType: 'Recipe',
      sequence: 1,
      data: payload,
    });

    await handler.handleIdempotent(event);

    expect(prisma.recipeProjection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipeId: 'r-001' },
      }),
    );
  });

  it('should handle RECIPE_VERSION_PUBLISHED and update projection + invalidate cache', async () => {
    const payload: RecipeVersionPublishedPayload = {
      recipeId: 'r-001',
      version: '1.0.0',
      productCode: 'PC-001',
      description: 'v1',
      steps: [],
      publishedBy: 'user1',
      publishedAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.RECIPE_VERSION_PUBLISHED,
      source: 'test',
      aggregateId: 'r-001',
      aggregateType: 'Recipe',
      sequence: 2,
      data: payload,
    });

    cache.set('r-001:1.0.0', { steps: [], version: '1.0.0', productCode: 'PC-001' });
    expect(cache.get('r-001:1.0.0')).not.toBeNull();

    await handler.handleIdempotent(event);

    expect(prisma.$transaction).toHaveBeenCalled();
    // Cache should be invalidated
    expect(cache.get('r-001:1.0.0')).toBeNull();
  });

  it('should handle RECIPE_OBSOLETED and update status', async () => {
    const payload: RecipeObsoletedPayload = {
      recipeId: 'r-001',
      obsoletedAt: new Date().toISOString(),
      obsoletedBy: 'admin',
    };
    const event = createEventEnvelope({
      type: MesEventType.RECIPE_OBSOLETED,
      source: 'test',
      aggregateId: 'r-001',
      aggregateType: 'Recipe',
      sequence: 3,
      data: payload,
    });

    await handler.handleIdempotent(event);

    expect(prisma.recipeProjection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { recipeId: 'r-001' },
        data: expect.objectContaining({ status: 'OBSOLETE' }),
      }),
    );
  });

  it('should skip duplicate events (idempotency)', async () => {
    prisma.processedEvent.findUnique.mockResolvedValue({ eventId: 'existing-event', processedAt: new Date() });

    const payload: RecipeCreatedPayload = {
      recipeId: 'r-002',
      productCode: 'PC-002',
      description: 'Test',
      createdAt: new Date().toISOString(),
    };
    const event = createEventEnvelope({
      type: MesEventType.RECIPE_CREATED,
      source: 'test',
      aggregateId: 'r-002',
      aggregateType: 'Recipe',
      sequence: 1,
      data: payload,
    });

    await handler.handleIdempotent(event);

    // Should not have called upsert because event was already processed
    expect(prisma.recipeProjection.upsert).not.toHaveBeenCalled();
  });
});
