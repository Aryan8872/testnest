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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('user')
@UseGuards(JwtAuthGuard, RoleGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('new')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Create a new user within the tenant (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(
    @Body() createUserDto: CreateUserDto,
    @CurrentTenant() tenantId: string,
  ) {
    return await this.userService.create(createUserDto, tenantId);
  }

  @Get('all')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Get paginated list of users (Admin only, cached in Redis)' })
  @ApiResponse({ status: 200, description: 'Paginated user list returned' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() paginationQueryDto: PaginationQueryDto,
  ) {
    return this.userService.findAll(tenantId, paginationQueryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User details' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.userService.findOne(id, tenantId);
  }

  @Patch(':id')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Update user details (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.userService.update(id, updateUserDto, tenantId);
  }

  @Delete(':id')
  @Roles(USERROLE.ADMIN, USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Delete user (Admin only)' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.userService.remove(id, tenantId);
  }
}
