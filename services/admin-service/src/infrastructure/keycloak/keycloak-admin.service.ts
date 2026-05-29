import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly keycloakUrl = process.env['KEYCLOAK_URL'] ?? 'http://keycloak:8080';
  private readonly realm = process.env['KEYCLOAK_REALM'] ?? 'mes';
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'admin-service';
  private readonly clientSecret = process.env['KEYCLOAK_CLIENT_SECRET'] ?? '';

  private tokenCache: TokenCache | null = null;

  /**
   * Obtain a client_credentials access token for service-to-service calls.
   * Token is cached until 30s before expiry.
   */
  async getClientAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.accessToken;
    }

    const url = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new UnauthorizedException(`Failed to obtain Keycloak token: ${text}`);
    }

    const json = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = {
      accessToken: json.access_token,
      expiresAt: now + json.expires_in * 1000,
    };

    return this.tokenCache.accessToken;
  }

  /**
   * Create a user in Keycloak.
   * Returns the Keycloak user ID extracted from the Location header.
   */
  async createUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    keycloakId?: string;
    password?: string;
  }): Promise<string> {
    const token = await this.getClientAccessToken();
    const url = `${this.keycloakUrl}/admin/realms/${this.realm}/users`;

    const body: Record<string, unknown> = {
      email: params.email,
      username: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      enabled: true,
    };

    if (params.password) {
      body['credentials'] = [{ type: 'password', value: params.password, temporary: false }];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Keycloak createUser failed (${res.status}): ${text}`);
    }

    // Extract user ID from Location header: .../users/{userId}
    const location = res.headers.get('Location') ?? '';
    const userId = location.split('/').pop();
    if (!userId) {
      throw new Error('Keycloak createUser: missing Location header');
    }

    this.logger.log(`Keycloak user created: ${userId}`);
    return userId;
  }

  /**
   * Assign a realm-level role to a Keycloak user.
   */
  async assignRealmRole(keycloakUserId: string, roleName: string): Promise<void> {
    const token = await this.getClientAccessToken();
    const baseUrl = `${this.keycloakUrl}/admin/realms/${this.realm}`;

    // 1. Fetch the role representation
    const roleRes = await fetch(`${baseUrl}/roles/${encodeURIComponent(roleName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!roleRes.ok) {
      throw new Error(`Keycloak role lookup failed for "${roleName}" (${roleRes.status})`);
    }

    const role = await roleRes.json() as { id: string; name: string };

    // 2. Map role to user
    const mapRes = await fetch(`${baseUrl}/users/${keycloakUserId}/role-mappings/realm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([role]),
    });

    if (!mapRes.ok) {
      const text = await mapRes.text();
      throw new Error(`Keycloak assignRealmRole failed (${mapRes.status}): ${text}`);
    }

    this.logger.log(`Role "${roleName}" assigned to Keycloak user ${keycloakUserId}`);
  }
}
