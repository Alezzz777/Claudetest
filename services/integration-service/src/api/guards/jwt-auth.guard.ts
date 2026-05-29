import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Pass-through JWT auth guard.
 * In production, replace with actual JWT verification using @nestjs/passport.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Pass-through: allow all requests
    // Production: verify JWT from Authorization header
    return true;
  }
}
