import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JwtPayload } from './jwt-auth.guard';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Roles Guard — checks that the authenticated user has at least one of the required roles.
 * Must be used after JwtAuthGuard (relies on request.user being populated).
 *
 * Usage: @UseGuards(JwtAuthGuard, RolesGuard) @Roles('ADMIN')
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true; // No role restriction
    }

    const request = context.switchToHttp().getRequest<Record<string, unknown>>();
    const user = request['user'] as JwtPayload | undefined;

    const userRoles = user?.realm_access?.roles ?? [];
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException(`Requires one of roles: ${requiredRoles.join(', ')}`);
    }

    return true;
  }
}
