import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';

@Module({
  imports: [IdempotencyModule],
  controllers: [InvoiceController],
  providers: [InvoiceService],
})
export class InvoiceModule {}

