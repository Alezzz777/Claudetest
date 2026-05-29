import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/**
 * Pass-through roles guard.
 * In production, check user roles from JWT payload against required roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    // Pass-through: allow all roles
    return true;
  }
}
