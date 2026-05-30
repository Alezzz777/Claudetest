import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KeycloakAdminService } from '../infrastructure/keycloak/keycloak-admin.service';

const TOKEN_RESPONSE = { access_token: 'test.jwt.token', expires_in: 300 };
const ROLE_RESPONSE = { id: 'role-id', name: 'OPERATOR' };

function mockFetch(...responses: { status?: number; body: object; headers?: Record<string, string> }[]) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1]!;
    return Promise.resolve({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: () => Promise.resolve(r.body),
      text: () => Promise.resolve(JSON.stringify(r.body)),
      headers: { get: (h: string) => (r.headers ?? {})[h] ?? null },
    });
  });
}

describe('KeycloakAdminService', () => {
  let service: KeycloakAdminService;

  beforeEach(() => {
    service = new KeycloakAdminService();
    process.env['KEYCLOAK_URL'] = 'http://localhost:8080';
    process.env['KEYCLOAK_REALM'] = 'mes';
    process.env['KEYCLOAK_CLIENT_ID'] = 'mes-services';
    process.env['KEYCLOAK_CLIENT_SECRET'] = 'mes-secret';
    // Reset token cache
    (service as any).tokenCache = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getClientAccessToken() fetches token from Keycloak', async () => {
    const fetchMock = mockFetch({ body: TOKEN_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    const token = await service.getClientAccessToken();
    expect(token).toBe('test.jwt.token');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toContain('/protocol/openid-connect/token');
  });

  it('getClientAccessToken() caches token and avoids second fetch', async () => {
    const fetchMock = mockFetch({ body: TOKEN_RESPONSE });
    vi.stubGlobal('fetch', fetchMock);

    await service.getClientAccessToken();
    await service.getClientAccessToken();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('createUser() returns Keycloak user ID from Location header', async () => {
    const fetchMock = mockFetch(
      { body: TOKEN_RESPONSE },
      {
        status: 201,
        body: {},
        headers: { Location: 'http://keycloak/admin/realms/mes/users/new-user-id' },
      },
    );
    vi.stubGlobal('fetch', fetchMock);

    const id = await service.createUser({
      email: 'new@mes.local',
      firstName: 'New',
      lastName: 'User',
    });
    expect(id).toBe('new-user-id');
  });

  it('assignRealmRole() fetches role then posts mapping', async () => {
    const fetchMock = mockFetch(
      { body: TOKEN_RESPONSE },
      { body: ROLE_RESPONSE },
      { status: 204, body: {} },
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(service.assignRealmRole('kc-user-id', 'OPERATOR')).resolves.not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3); // token + GET role + POST mapping
  });
});
