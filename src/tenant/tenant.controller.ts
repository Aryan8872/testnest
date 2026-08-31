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
import { TenantService } from './tenant.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { RoleGuard } from '../common/guards/rolekeyguard/role.guard.js';
import { Roles } from '../decorators/roles.decorator.js';
import { USERROLE } from '@prisma/client';

@ApiTags('Tenants')
@ApiBearerAuth('JWT-auth')
@Controller('tenant')
@UseGuards(JwtAuthGuard, RoleGuard)
export class TenantController {
  constructor(private readonly tenantService: TenantService) {}

  @Post('/new')
  @Roles(USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Create a new tenant organization (SUPERADMIN only)' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantService.create(createTenantDto);
  }

  @Get()
  @Roles(USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Get paginated list of all tenants (SUPERADMIN only)' })
  @ApiResponse({ status: 200, description: 'Paginated tenant list returned' })
  findAll(@Query() paginationQueryDto: PaginationQueryDto) {
    return this.tenantService.findAll(paginationQueryDto);
  }

  @Get(':id')
  @Roles(USERROLE.SUPERADMIN, USERROLE.ADMIN)
  @ApiOperation({ summary: 'Get tenant details by ID' })
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiResponse({ status: 200, description: 'Tenant details' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string) {
    return this.tenantService.findOne(id);
  }

  @Patch(':id')
  @Roles(USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Update tenant organization (SUPERADMIN only)' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantService.update(id, updateTenantDto);
  }

  @Delete(':id')
  @Roles(USERROLE.SUPERADMIN)
  @ApiOperation({ summary: 'Delete tenant organization (SUPERADMIN only)' })
  @ApiParam({ name: 'id', description: 'Tenant ID' })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  remove(@Param('id') id: string) {
    return this.tenantService.remove(id);
  }
}
