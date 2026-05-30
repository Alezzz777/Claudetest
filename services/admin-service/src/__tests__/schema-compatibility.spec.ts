import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SchemaRegistryService } from '../infrastructure/schema-registry/schema-registry.service';

const SCHEMA = { type: 'object', properties: { id: { type: 'string' } } };

function mockFetch(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe('SchemaRegistryService', () => {
  let service: SchemaRegistryService;

  beforeEach(() => {
    service = new SchemaRegistryService();
    process.env['SCHEMA_REGISTRY_URL'] = 'http://localhost:8081';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registerSchema() returns schema id from API response', async () => {
    vi.stubGlobal('fetch', mockFetch({ id: 42 }));
    const id = await service.registerSchema('mes.production.orders-value', SCHEMA);
    expect(id).toBe(42);
  });

  it('checkCompatibility() returns true when API says compatible', async () => {
    vi.stubGlobal('fetch', mockFetch({ is_compatible: true }));
    const result = await service.checkCompatibility('test-subject', SCHEMA);
    expect(result).toBe(true);
  });

  it('checkCompatibility() returns false when API says incompatible', async () => {
    vi.stubGlobal('fetch', mockFetch({ is_compatible: false }));
    const result = await service.checkCompatibility('test-subject', SCHEMA);
    expect(result).toBe(false);
  });

  it('checkCompatibility() returns false on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await service.checkCompatibility('test-subject', SCHEMA);
    expect(result).toBe(false);
  });

  it('getLatestSchema() returns version and schema on success', async () => {
    vi.stubGlobal('fetch', mockFetch({ version: 3, schema: JSON.stringify(SCHEMA) }));
    const result = await service.getLatestSchema('test-subject');
    expect(result).not.toBeNull();
    expect(result!.version).toBe(3);
  });

  it('getLatestSchema() returns null on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404));
    const result = await service.getLatestSchema('test-subject');
    expect(result).toBeNull();
  });
});
