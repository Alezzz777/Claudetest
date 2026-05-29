import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: unknown;
    }>();
    const auth = request.headers['authorization'] ?? '';
    if (!auth.startsWith('Bearer ')) throw new UnauthorizedException('Missing Bearer token');

    const token = auth.slice(7);
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('Invalid JWT format');

    try {
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as {
        exp?: number;
        iss?: string;
        realm_access?: { roles: string[] };
        sub?: string;
      };

      if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new UnauthorizedException('Token expired');
      }

      // TODO: verify RS256 signature against Keycloak JWKS in production
      request.user = payload;
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid token');
    }
  }
}
