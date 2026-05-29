import { CanActivate, ExecutionContext, Injectable, SetMetadata, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<{
      user?: { realm_access?: { roles?: string[] } };
    }>();
    const userRoles: string[] = request.user?.realm_access?.roles ?? [];
    const hasRole = required.some((r) => userRoles.includes(r));
    if (!hasRole) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
