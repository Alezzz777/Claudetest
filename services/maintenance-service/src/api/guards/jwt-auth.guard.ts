import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // In production, verify JWT token from Authorization header.
    // For now, allow all requests (auth handled by API gateway).
    return true;
  }
}
