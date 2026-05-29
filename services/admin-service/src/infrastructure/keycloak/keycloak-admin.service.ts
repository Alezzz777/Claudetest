import { Injectable, Logger } from '@nestjs/common';

interface TokenCache {
  token: string;
  expiresAt: number;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly keycloakUrl = process.env['KEYCLOAK_URL'] ?? 'http://keycloak:8080';
  private readonly realm = process.env['KEYCLOAK_REALM'] ?? 'mes';
  private readonly clientId = process.env['KEYCLOAK_CLIENT_ID'] ?? 'mes-services';
  private readonly clientSecret = process.env['KEYCLOAK_CLIENT_SECRET'] ?? 'mes-secret';

  private tokenCache: TokenCache | null = null;

  async getClientAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 30_000) {
      return this.tokenCache.token;
    }

    const url = `${this.keycloakUrl}/realms/${this.realm}/protocol/openid-connect/token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      throw new Error(`Keycloak token error: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: now + data.expires_in * 1000,
    };
    return this.tokenCache.token;
  }

  async createUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    enabled?: boolean;
    temporaryPassword?: string;
  }): Promise<string> {
    const token = await this.getClientAccessToken();
    const url = `${this.keycloakUrl}/admin/realms/${this.realm}/users`;

    const body: Record<string, unknown> = {
      email: params.email,
      firstName: params.firstName,
      lastName: params.lastName,
      enabled: params.enabled ?? true,
      emailVerified: true,
    };

    if (params.temporaryPassword) {
      body['credentials'] = [{ type: 'password', value: params.temporaryPassword, temporary: true }];
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
      throw new Error(`Keycloak createUser error: ${res.status} ${await res.text()}`);
    }

    // Keycloak returns user ID in Location header
    const location = res.headers.get('Location') ?? '';
    const keycloakUserId = location.split('/').pop() ?? '';
    this.logger.log(`Created Keycloak user ${keycloakUserId} for ${params.email}`);
    return keycloakUserId;
  }

  async assignRealmRole(keycloakUserId: string, roleName: string): Promise<void> {
    const token = await this.getClientAccessToken();
    const baseUrl = `${this.keycloakUrl}/admin/realms/${this.realm}`;

    // Get role representation
    const roleRes = await fetch(`${baseUrl}/roles/${roleName}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!roleRes.ok) {
      throw new Error(`Role ${roleName} not found: ${roleRes.status}`);
    }
    const role = await roleRes.json();

    // Assign role to user
    const mapRes = await fetch(`${baseUrl}/users/${keycloakUserId}/role-mappings/realm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify([role]),
    });

    if (!mapRes.ok) {
      throw new Error(`assignRealmRole error: ${mapRes.status} ${await mapRes.text()}`);
    }
    this.logger.log(`Assigned role ${roleName} to user ${keycloakUserId}`);
  }
}
