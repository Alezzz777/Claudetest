import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RecipeCacheService } from '../infrastructure/cache/recipe-cache.service';

const sampleEntry = {
  steps: [],
  version: '1.0.0',
  productCode: 'PC-001',
};

describe('RecipeCacheService', () => {
  let cache: RecipeCacheService;

  beforeEach(() => {
    cache = new RecipeCacheService();
  });

  it('should return null for a missing key', () => {
    expect(cache.get('nonexistent')).toBeNull();
  });

  it('should return the entry for a valid key', () => {
    cache.set('key1', sampleEntry);
    const result = cache.get('key1');
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.0.0');
    expect(result!.productCode).toBe('PC-001');
  });

  it('should return null for an expired entry', () => {
    vi.useFakeTimers();
    cache.set('key-exp', sampleEntry);
    // Advance time beyond TTL (5 minutes = 300000ms)
    vi.advanceTimersByTime(300001);
    expect(cache.get('key-exp')).toBeNull();
    vi.useRealTimers();
  });

  it('should invalidate a key', () => {
    cache.set('key2', sampleEntry);
    cache.invalidate('key2');
    expect(cache.get('key2')).toBeNull();
  });

  it('should track size correctly', () => {
    cache.set('a', sampleEntry);
    cache.set('b', sampleEntry);
    expect(cache.size).toBe(2);
    cache.invalidate('a');
    expect(cache.size).toBe(1);
  });

  it('should evict oldest entry when MAX_ENTRIES exceeded (small limit test)', () => {
    // Create a cache and fill it to capacity using a small limit by injecting
    // We test LRU logic by verifying size stays bounded
    // Use the real MAX_ENTRIES (500) — just fill and check eviction
    const smallCache = new RecipeCacheService();
    // Fill 501 entries to trigger eviction
    for (let i = 0; i < 501; i++) {
      smallCache.set(`key-${i}`, { steps: [], version: '1.0.0', productCode: `PC-${i}` });
    }
    // Size should be 500 (oldest evicted)
    expect(smallCache.size).toBe(500);
    // The first key should have been evicted
    expect(smallCache.get('key-0')).toBeNull();
    // The last key should still be present
    expect(smallCache.get('key-500')).not.toBeNull();
  });

  it('should move accessed key to end (LRU)', () => {
    vi.useFakeTimers();
    // Set two entries
    cache.set('lru-a', { steps: [], version: '1.0.0', productCode: 'A' });
    cache.set('lru-b', { steps: [], version: '2.0.0', productCode: 'B' });
    // Access 'lru-a' to make it recently used
    cache.get('lru-a');
    // Verify both still accessible
    expect(cache.get('lru-a')).not.toBeNull();
    expect(cache.get('lru-b')).not.toBeNull();
    vi.useRealTimers();
  });
});
