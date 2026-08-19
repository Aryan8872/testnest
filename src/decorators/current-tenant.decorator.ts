import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './current-user.decorator.js';

//Small convenience decorator to quickly inject tenantId from req.user into controller arguments.
//When you write @CurrentTenant() tenantId: string in controller handler,
// Nest runs this function to provide the value.
export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return user?.tenantId;
  },
);
