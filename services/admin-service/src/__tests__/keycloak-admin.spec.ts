import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakAdminService } from '../infrastructure/keycloak/keycloak-admin.service';

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    service = new KeycloakAdminService();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // Reset the internal token cache between tests by accessing private field
    (service as unknown as { tokenCache: null }).tokenCache = null;
  });

  it('getClientAccessToken() calls correct endpoint with client_credentials', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'my-token', expires_in: 300 }),
    });

    const token = await service.getClientAccessToken();
    expect(token).toBe('my-token');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/protocol/openid-connect/token');
    expect((opts.body as string)).toContain('grant_type=client_credentials');
  });

  it('Token is cached and not re-fetched on second call within TTL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'cached-token', expires_in: 300 }),
    });

    const token1 = await service.getClientAccessToken();
    const token2 = await service.getClientAccessToken();

    expect(token1).toBe('cached-token');
    expect(token2).toBe('cached-token');
    expect(mockFetch).toHaveBeenCalledOnce(); // only one fetch
  });

  it('createUser() returns extracted user ID from Location header', async () => {
    // First call: token fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'tok', expires_in: 300 }),
    });
    // Second call: create user
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      headers: { get: (h: string) => h === 'Location' ? 'http://keycloak/admin/realms/mes/users/new-user-id' : null },
    });

    const userId = await service.createUser({
      email: 'user@example.com',
      firstName: 'John',
      lastName: 'Doe',
    });

    expect(userId).toBe('new-user-id');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
