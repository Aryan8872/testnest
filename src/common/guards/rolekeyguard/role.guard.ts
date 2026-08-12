import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RoleGuard implements CanActivate {
  //runs just before controller and after middleware
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const role = request.headers['role'];
    if (role !== 'admin') {
      throw new UnauthorizedException(
        'You are not allowed to perform this action',
      );
    }
    return true;
  }
}
