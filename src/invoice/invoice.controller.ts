import { BadRequestException, Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { CreateInvoiceDTO } from './dto/create-invoice-dto.js';
import type { Request } from 'express';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}
  @Post('/new')
  @HttpCode(201)
  async createInvoice(@Body() dto: CreateInvoiceDTO, @Req() req: Request) {
    const idempotencyKey =
      req.header('Idempotency-Key') ?? req.header('idempotency-key');
    if(!idempotencyKey) throw new BadRequestException({errorCode:"NO_IDEMPOTENCY_KEY",message:"idempotency key is required"})
    const ownerId = (req as any).user?.id ?? null;
    const ownerType = ownerId ? 'user' : '';
    const result = await this.invoiceService.createInvoice(dto,idempotencyKey,ownerType,ownerId);
    return result;
  }
}

