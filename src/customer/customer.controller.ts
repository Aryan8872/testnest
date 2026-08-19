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

@Controller('customer')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.create(createCustomerDto, tenantId);
  }

  @Get()
  findAll(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customerService.findAll(tenantId, page, limit);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.update(id, updateCustomerDto, tenantId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.customerService.remove(id, tenantId);
  }
}
