import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchemaRegistryService } from '../infrastructure/schema-registry/schema-registry.service';

describe('SchemaRegistryService', () => {
  let service: SchemaRegistryService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new SchemaRegistryService();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('checkCompatibility() returns true when API responds { is_compatible: true }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ is_compatible: true }),
    });

    const result = await service.checkCompatibility('test-subject', { type: 'record' });
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('checkCompatibility() returns false when API responds { is_compatible: false }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ is_compatible: false }),
    });

    const result = await service.checkCompatibility('test-subject', { type: 'record' });
    expect(result).toBe(false);
  });

  it('registerSchema() returns version number from API response { id: 42 }', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 42 }),
    });

    const id = await service.registerSchema('test-subject', { type: 'record', name: 'Test' });
    expect(id).toBe(42);
  });

  it('checkCompatibility() returns true for 404 (no previous version)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Subject not found',
    });

    const result = await service.checkCompatibility('new-subject', { type: 'record' });
    expect(result).toBe(true);
  });
});
