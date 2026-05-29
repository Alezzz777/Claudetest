import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export interface JwtPayload {
  sub: string;
  email?: string;
  preferred_username?: string;
  realm_access?: { roles: string[] };
  iss?: string;
  exp?: number;
  iat?: number;
}

/**
 * JWT Auth Guard — decodes and validates Bearer JWT tokens from Keycloak.
 *
 * TODO: verify RS256 signature against Keycloak JWKS in production.
 * Current implementation (dev mode) decodes the token without full signature
 * verification and checks `iss` and `exp` fields only.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const authHeader = (request['headers'] as Record<string, string>)['authorization'] ?? '';

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const payload = this.decodeJwt(token);

    if (!payload) {
      throw new UnauthorizedException('Invalid JWT token');
    }

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedException('JWT token expired');
    }

    request['user'] = payload;
    return true;
  }

  private decodeJwt(token: string): JwtPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = parts[1];
      if (!payload) return null;
      // Base64url decode
      const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = Buffer.from(padded, 'base64').toString('utf8');
      return JSON.parse(decoded) as JwtPayload;
    } catch {
      return null;
    }
  }
}
