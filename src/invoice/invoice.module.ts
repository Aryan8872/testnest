import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller.js';
import { InvoiceService } from './invoice.service.js';
import { IdempotencyModule } from '../common/idempotency/idempotency.module.js';
import { BullModule } from '@nestjs/bullmq';
import { InvoiceProcessor } from './invoice.processor.js';
import { PdfService } from '../common/pdf/pdf.service.js';
import { InvoiceCronService } from './invoice-cron.service.js';

@Module({
  imports: [
    IdempotencyModule,
    BullModule.registerQueue({
      name: 'invoice-queue',
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, InvoiceProcessor, PdfService, InvoiceCronService],
})
export class InvoiceModule {}
