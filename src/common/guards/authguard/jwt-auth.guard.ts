import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../../decorators/public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }
  //if it returns true the request proceeds; false blocks (Nest returns 403).
  //  Guards can also throw exceptions (e.g., ForbiddenException) to return specific error bodies.
  canActivate(context: ExecutionContext) {
    //If route is public, return true (skip auth).
    //Otherwise call Passport's canActivate, which runs strategy and
    // returns boolean or triggers handleRequest.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  //AuthGuard calls handleRequest with the result of the strategy (e.g., token invalid => info contains message).
  //By overriding, you customize the thrown exception body (structured with errorCode).
  //Returning user sets req.user (used later by guards like RoleGuard).
  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw (
        err ||
        new UnauthorizedException({
          errorCode: 'UNAUTHORIZED',
          message:
            info?.message || 'Authentication required to access this resource',
        })
      );
    }
    return user;
  }
}
