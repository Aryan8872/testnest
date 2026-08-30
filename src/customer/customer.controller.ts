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
import { CustomerService } from './customer.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { CurrentTenant } from '../decorators/current-tenant.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';

@ApiTags('Customers')
@ApiBearerAuth('JWT-auth')
@Controller('customer')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new customer under current tenant' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.create(createCustomerDto, tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get paginated customer list for tenant (cached in Redis)' })
  @ApiResponse({ status: 200, description: 'Paginated customer list returned' })
  findAll(
    @CurrentTenant() tenantId: string,
    @Query() paginationQueryDto: PaginationQueryDto,
  ) {
    return this.customerService.findAll(tenantId, paginationQueryDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  findOne(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.customerService.findOne(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update customer details' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.update(id, updateCustomerDto, tenantId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete customer' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  remove(@Param('id') id: string, @CurrentTenant() tenantId: string) {
    return this.customerService.remove(id, tenantId);
  }
}
