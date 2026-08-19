import { SetMetadata } from '@nestjs/common';
import { USERROLE } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: USERROLE[]) => SetMetadata(ROLES_KEY, roles);
