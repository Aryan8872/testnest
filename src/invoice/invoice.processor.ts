import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InvoiceService } from './invoice.service.js';
import { PdfService } from '../common/pdf/pdf.service.js';
import { MailerService } from '@nestjs-modules/mailer';
import * as nodemailer from 'nodemailer';

export interface GenerateAndSendInvoiceJobPayload {
  invoiceId: string;
  customerEmail: string;
  tenantId: string;
}

@Processor('invoice-queue')
export class InvoiceProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceProcessor.name);

  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly pdfService: PdfService,
    private readonly mailerService: MailerService,
  ) {
    super();
  }

  async process(job: Job<GenerateAndSendInvoiceJobPayload, void, string>): Promise<void> {
    this.logger.log(`Processing background job ${job.id} of type ${job.name}`);

    switch (job.name) {
      case 'generate-and-send-invoice':
        await this.handleGenerateAndSend(job.data);
        break;
      default:
        this.logger.warn(`Unknown job type received: ${job.name}`);
    }
  }

  private async handleGenerateAndSend(data: GenerateAndSendInvoiceJobPayload): Promise<void> {
    try {
      // 1. Fetch full invoice from DB by primary ID
      this.logger.log(
        `[InvoiceProcessor] Fetching data for invoice ${data.invoiceId}...`,
      );
      let invoice = await this.invoiceService.findById(
        data.invoiceId,
        data.tenantId,
      );

      if (!invoice) {
        invoice = await this.invoiceService.getInvoiceByCustomerEmail(
          data.customerEmail,
          data.tenantId,
        );
      }

      if (!invoice) {
        this.logger.warn(`Invoice not found for ${data.invoiceId}`);
        return;
      }

      // 2. Generate PDF
      this.logger.log(
        `[InvoiceProcessor] Generating PDF for invoice ${data.invoiceId}...`,
      );
      const pdfBuffer = await this.pdfService.generateInvoicePdf(invoice);
      this.logger.log(
        `[InvoiceProcessor] PDF generated successfully (${pdfBuffer.length} bytes)`,
      );

      // 3. Send Email
      this.logger.log(
        `[InvoiceProcessor] Sending email to ${data.customerEmail}...`,
      );

      const info = await this.mailerService.sendMail({
        to: data.customerEmail,
        subject: `Your Invoice from CMS (ID: ${invoice.id})`,
        text: 'Thank you for your business. Please find your invoice attached.',
        attachments: [
          {
            filename: `invoice-${invoice.id}.pdf`,
            content: pdfBuffer,
          },
        ],
      });

      this.logger.log(
        `[InvoiceProcessor] Successfully completed all background tasks for invoice ${data.invoiceId}!`,
      );

      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        this.logger.log(`[InvoiceProcessor] Preview Email URL: ${previewUrl}`);
      }
    } catch (error: any) {
      this.logger.error(
        `[InvoiceProcessor] FAILED for invoice ${data.invoiceId}: ${error.message}`,
        error.stack,
      );
      throw error; // Re-throw so BullMQ marks the job as failed
    }
  }
}
