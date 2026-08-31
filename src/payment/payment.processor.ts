import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PdfService } from '../common/pdf/pdf.service.js';
import { MailerService } from '@nestjs-modules/mailer';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PaymentReceiptJobData {
  paymentId: string;
  invoiceId: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  gateway: string;
  transactionId: string;
  tenantId: string;
}

export interface WebhookRetryJobData {
  gateway: 'ESEWA' | 'KHALTI';
  payload: any;
  tenantId: string;
}

@Processor('payment-queue')
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly pdfService: PdfService,
    private readonly mailerService: MailerService,
    private readonly prismaService: PrismaService,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log({
      event: 'payment_queue.processing',
      jobId: job.id,
      jobName: job.name,
      attemptsMade: job.attemptsMade,
    });

    switch (job.name) {
      case 'send-payment-receipt':
        await this.handleSendPaymentReceipt(job.data as PaymentReceiptJobData);
        break;
      default:
        this.logger.warn(`Unknown job received in payment-queue: ${job.name}`);
    }
  }

  private async handleSendPaymentReceipt(data: PaymentReceiptJobData): Promise<void> {
    try {
      this.logger.log({
        event: 'payment_receipt.generating_pdf',
        paymentId: data.paymentId,
        invoiceId: data.invoiceId,
        recipient: data.customerEmail,
      });

      // 1. Generate Payment Receipt PDF Buffer
      const receiptPdfBuffer = await this.pdfService.generatePaymentReceiptPdf({
        paymentId: data.paymentId,
        transactionId: data.transactionId,
        gateway: data.gateway,
        amount: data.amount,
        paymentDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        invoiceId: data.invoiceId,
      });

      // 2. Dispatch Email with Attached PDF
      await this.mailerService.sendMail({
        to: data.customerEmail,
        subject: `Payment Receipt: Invoice #${data.invoiceId} [${data.gateway}]`,
        text: `Dear ${data.customerName},\n\nWe have received your payment of NPR ${(data.amount / 100).toFixed(2)} for Invoice #${data.invoiceId} via ${data.gateway}.\n\nPlease find your official payment receipt attached.\n\nThank you!`,
        attachments: [
          {
            filename: `receipt-${data.paymentId}.pdf`,
            content: receiptPdfBuffer,
          },
        ],
      });

      this.logger.log({
        event: 'payment_receipt.sent_successfully',
        paymentId: data.paymentId,
        recipient: data.customerEmail,
      });
    } catch (error: any) {
      this.logger.error({
        event: 'payment_receipt.failed',
        paymentId: data.paymentId,
        error: error.message,
        stack: error.stack,
      });
      throw error; // Let BullMQ retry with exponential backoff & DLQ
    }
  }
}
