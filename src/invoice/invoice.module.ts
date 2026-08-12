import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';

@Module({
  controllers: [InvoiceController],
  providers: [InvoiceService]
})
export class InvoiceModule {}
