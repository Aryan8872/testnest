import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { CreateInvoiceDTO } from './dto/create-invoice-dto.js';
import type { Request } from 'express';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator.js';

@Controller('invoice')
@UseGuards(JwtAuthGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  @Post('/new')
  @HttpCode(201)
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
}
