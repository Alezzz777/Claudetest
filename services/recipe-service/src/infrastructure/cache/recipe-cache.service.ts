import { Injectable } from '@nestjs/common';
import type { RecipeStep } from '../../domain/recipe.aggregate';

interface CacheEntry {
  steps: RecipeStep[];
  version: string;
  productCode: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 500;

/**
 * In-memory LRU cache for active recipe versions.
 * Keyed by `recipeId:version` or `productCode:latest`.
 * Prevents redundant DB reads on hot paths (production order dispatch).
 */
@Injectable()
export class RecipeCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly accessOrder: string[] = [];

  set(key: string, value: Omit<CacheEntry, 'expiresAt'>): void {
    this.evictExpired();
    if (this.cache.size >= MAX_ENTRIES) {
      const oldest = this.accessOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { ...value, expiresAt: Date.now() + TTL_MS });
    this.accessOrder.push(key);
  }

  get(key: string): Omit<CacheEntry, 'expiresAt'> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    // Move to end (most recently used)
    const idx = this.accessOrder.indexOf(key);
    if (idx !== -1) this.accessOrder.splice(idx, 1);
    this.accessOrder.push(key);
    return { steps: entry.steps, version: entry.version, productCode: entry.productCode };
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [k, v] of this.cache) {
      if (v.expiresAt < now) this.cache.delete(k);
    }
  }

  get size(): number { return this.cache.size; }
}
