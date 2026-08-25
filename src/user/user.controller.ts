import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { RoleGuard } from '../common/guards/rolekeyguard/role.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { CurrentTenant } from '../decorators/current-tenant.decorator.js';
import { USERROLE } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';

@Controller('user')
// @UseGuards(JwtAuthGuard, RoleGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('new')
  // @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentTenant() tenantId: string,
  ) {
    return await this.userService.create(createUserDto, tenantId);
  }

  @Get('all')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() paginationQueryDto: PaginationQueryDto,
  ) {
    return this.userService.findAll(tenantId, paginationQueryDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.userService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.userService.update(id, updateUserDto, tenantId);
  }

  @Delete(':id')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.userService.remove(id, tenantId);
  }
}
