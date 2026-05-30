import { describe, it, expect } from 'vitest';

const SKIP = process.env['SKIP_INFRA_TESTS'] === 'true';

const KEYCLOAK_TOKEN_URL =
  'http://localhost:8080/realms/mes/protocol/openid-connect/token';

describe.skipIf(SKIP)('Keycloak token acquisition', () => {
  it('obtains an access_token via client_credentials grant', async () => {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'mes-services',
      client_secret: 'mes-secret',
    });

    const response = await fetch(KEYCLOAK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    expect(response.ok).toBe(true);

    const json = (await response.json()) as Record<string, unknown>;
    expect(typeof json['access_token']).toBe('string');

    // Validate JWT structure: header.payload.signature (3 base64url parts)
    const token = json['access_token'] as string;
    const parts = token.split('.');
    expect(parts).toHaveLength(3);

    for (const part of parts) {
      // Each part must be non-empty base64url
      expect(part.length).toBeGreaterThan(0);
      expect(part).toMatch(/^[A-Za-z0-9\-_]+$/);
    }
  });
});
