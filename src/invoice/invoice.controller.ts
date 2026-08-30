import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { CreateInvoiceDTO } from './dto/create-invoice-dto.js';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../decorators/current-user.decorator.js';
import { CurrentTenant } from '../decorators/current-tenant.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';

@ApiTags('Invoices')
@ApiBearerAuth('JWT-auth')
@Controller('invoice')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('/new')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create invoice with idempotency and dispatch PDF background job' })
  @ApiHeader({
    name: 'Idempotency-Key',
    description: 'Unique UUID / key to guarantee at-most-once processing',
    required: true,
  })
  @ApiResponse({ status: 201, description: 'Invoice created and PDF generation queued' })
  @ApiResponse({ status: 400, description: 'Validation error or missing idempotency key' })
  @ApiResponse({ status: 409, description: 'Concurrent identical request in progress' })
  async createInvoice(
    @Body() dto: CreateInvoiceDTO,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const idempotencyKey =
      req.header('Idempotency-Key') ?? req.header('idempotency-key');
    if (!idempotencyKey)
      throw new BadRequestException({
        errorCode: 'NO_IDEMPOTENCY_KEY',
        message: 'Idempotency key is required',
      });

    const ownerId = user?.id ?? null;
    const ownerType = ownerId ? 'user' : '';
    const tenantId = user?.tenantId;

    const result = await this.invoiceService.createInvoice(
      dto,
      idempotencyKey,
      ownerType,
      ownerId,
      tenantId,
    );
    return result;
  }
  @Get('/all')
  @ApiOperation({ summary: 'Get paginated list of tenant invoices (cached in Redis)' })
  @ApiResponse({ status: 200, description: 'Paginated invoice list' })
  findAllInvoice(
    @CurrentTenant() tenantId: string,
    @Query() paginationQueryDto: PaginationQueryDto,
  ) {
    return this.invoiceService.findAll(tenantId, paginationQueryDto);
  }
}
