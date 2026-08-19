import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { USERROLE } from '@prisma/client';
import { ROLES_KEY } from '../../../decorators/roles.decorator.js';

@Injectable()
export class RoleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<USERROLE[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    //user should have been injected by the authentication guard earlier (e.g., JwtAuthGuard).
    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      throw new ForbiddenException({
        errorCode: 'FORBIDDEN',
        message: 'No role assigned or user unauthenticated',
      });
    }

    // SUPERADMIN has access to all roles
    if (user.role === USERROLE.SUPERADMIN) {
      return true;
    }

    const hasRole = requiredRoles.includes(user.role);
    if (!hasRole) {
      throw new ForbiddenException({
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: `User role '${user.role}' is not authorized to access this resource`,
      });
    }

    return true;
  }
}
