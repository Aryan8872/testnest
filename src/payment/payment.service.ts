import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHmac } from 'crypto';
import { INVOICESTATUS, PAYMENTGATEWAY } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import {
  PAYMENT_SUCCESS_COUNTER,
  PAYMENT_REVENUE_COUNTER,
  PAYMENT_DURATION_HISTOGRAM,
} from './payment.metrics.js';

interface EsewaCallbackPayload {
  transaction_code: string;
  status: string;
  total_amount: string;
  transaction_uuid: string;
  product_code: string;
  signed_field_names: string;
  signature: string;
}

interface KhaltiLookupResponse {
  pidx: string;
  total_amount: number;
  status: string;
  transaction_id: string;
  fee: number;
  purchase_order_id: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly esewaSecretKey: string;
  private readonly esewaMerchantCode: string;
  private readonly esewaBaseUrl: string;
  private readonly khaltiSecretKey: string;
  private readonly khaltiBaseUrl: string;
  private readonly appUrl: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectQueue('payment-queue') private readonly paymentQueue: Queue,
    @InjectMetric(PAYMENT_SUCCESS_COUNTER) private readonly paymentSuccessCounter: Counter<string>,
    @InjectMetric(PAYMENT_REVENUE_COUNTER) private readonly paymentRevenueCounter: Counter<string>,
    @InjectMetric(PAYMENT_DURATION_HISTOGRAM) private readonly paymentDurationHistogram: Histogram<string>,
  ) {
    this.esewaSecretKey = this.configService.getOrThrow<string>('ESEWA_SECRET_KEY');
    this.esewaMerchantCode = this.configService.getOrThrow<string>('ESEWA_MERCHANT_CODE');
    this.esewaBaseUrl = this.configService.getOrThrow<string>('ESEWA_BASE_URL');
    this.khaltiSecretKey = this.configService.getOrThrow<string>('KHALTI_SECRET_KEY');
    this.khaltiBaseUrl = this.configService.get<string>('KHALTI_BASE_URL') ?? 'https://a.khalti.com';
    this.appUrl = this.configService.getOrThrow<string>('APP_URL');
  }

  // ---------------------------------------------------------------------------
  // HELPER — bump Redis invoice version so all list caches become stale
  // ---------------------------------------------------------------------------
  private async bumpInvoiceVersion(tenantId: string): Promise<void> {
    const key = `invoice:version:${tenantId}`;
    const current = (await this.cacheManager.get<number>(key)) ?? 0;
    await this.cacheManager.set(key, current + 1, 0); // 0 = no expiry
  }

  // ---------------------------------------------------------------------------
  // HELPER — eSewa HMAC-SHA256 signature
  // ---------------------------------------------------------------------------
  private signEsewa(totalAmount: number, txnUuid: string): string {
    const message = `total_amount=${totalAmount},transaction_uuid=${txnUuid},product_code=${this.esewaMerchantCode}`;
    return createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');
  }

  // ---------------------------------------------------------------------------
  // HELPER — verify eSewa callback signature
  // ---------------------------------------------------------------------------
  private verifyEsewaCallback(payload: EsewaCallbackPayload): boolean {
    const fieldsToSign = payload.signed_field_names.split(',');
    const message = fieldsToSign.map((f) => `${f}=${(payload as any)[f]}`).join(',');
    const expectedSignature = createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');
    return expectedSignature === payload.signature;
  }

  // ---------------------------------------------------------------------------
  // HELPER — compute invoice status from payment total vs invoice amount
  // ---------------------------------------------------------------------------
  private computeStatus(totalPaid: number, invoiceAmount: number): INVOICESTATUS | null {
    if (totalPaid >= invoiceAmount) return INVOICESTATUS.PAID;
    if (totalPaid > 0) return INVOICESTATUS.PARTIALLY_PAID;
    return null;
  }

  // ---------------------------------------------------------------------------
  // CORE — reconcile payment sum and update invoice status
  // ---------------------------------------------------------------------------
  private async reconcileInvoiceStatus(invoiceId: string, tenantId: string): Promise<void> {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: { select: { amount: true } } },
    });

    if (!invoice) return;

    const totalPaid = invoice.payments.reduce((sum, p) => sum + p.amount, 0);
    const newStatus = this.computeStatus(totalPaid, invoice.amount);

    if (newStatus && newStatus !== invoice.status) {
      await this.prismaService.invoice.update({
        where: { id: invoiceId },
        data: { status: newStatus },
      });
      await this.bumpInvoiceVersion(tenantId);

      this.logger.log({
        event: 'payment.invoice_status_updated',
        invoiceId,
        tenantId,
        previousStatus: invoice.status,
        newStatus,
        totalPaidPaisa: totalPaid,
        invoiceAmountPaisa: invoice.amount,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // HELPER — dispatch background receipt email job via BullMQ
  // ---------------------------------------------------------------------------
  private async queueReceiptEmail(
    paymentId: string,
    invoiceId: string,
    customerEmail: string,
    customerName: string,
    amount: number,
    gateway: string,
    transactionId: string,
    tenantId: string,
  ): Promise<void> {
    try {
      await this.paymentQueue.add(
        'send-payment-receipt',
        {
          paymentId,
          invoiceId,
          customerEmail,
          customerName,
          amount,
          gateway,
          transactionId,
          tenantId,
        },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
        },
      );
    } catch (error: any) {
      this.logger.error({
        event: 'payment.queue_receipt_email_failed',
        paymentId,
        error: error.message,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // eSewa — Step 1: Generate signed checkout form payload
  // ---------------------------------------------------------------------------
  async initiateEsewaPayment(invoiceId: string, tenantId: string) {
    const invoice = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });

    if (!invoice) {
      throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status === INVOICESTATUS.PAID) {
      throw new BadRequestException({ errorCode: 'INVOICE_ALREADY_PAID', message: 'This invoice is already fully paid' });
    }

    if (invoice.status === INVOICESTATUS.CANCELLED) {
      throw new BadRequestException({ errorCode: 'INVOICE_CANCELLED', message: 'Cannot pay a cancelled invoice' });
    }

    const amountNPR = invoice.amount / 100;
    const txnUuid = `INV-${invoiceId}-${Date.now()}`;
    const signature = this.signEsewa(amountNPR, txnUuid);

    return {
      formAction: `${this.esewaBaseUrl}/api/epay/main/v2/form`,
      fields: {
        amount: amountNPR,
        tax_amount: 0,
        total_amount: amountNPR,
        transaction_uuid: txnUuid,
        product_code: this.esewaMerchantCode,
        product_service_charge: 0,
        product_delivery_charge: 0,
        success_url: `${this.appUrl}/payment/esewa/callback?tenant_id=${tenantId}`,
        failure_url: `${this.appUrl}/payment/esewa/failure`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // eSewa — Step 2: Handle success callback
  // ---------------------------------------------------------------------------
  async handleEsewaCallback(encodedData: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    const timer = this.paymentDurationHistogram.startTimer({ gateway: 'ESEWA' });
    try {
      let payload: EsewaCallbackPayload;
      try {
        const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
        payload = JSON.parse(decoded) as EsewaCallbackPayload;
      } catch {
        throw new BadRequestException({ errorCode: 'INVALID_ESEWA_PAYLOAD', message: 'Invalid eSewa callback data' });
      }

      if (!this.verifyEsewaCallback(payload)) {
        this.logger.warn({ event: 'payment.esewa_signature_mismatch', payload });
        throw new BadRequestException({ errorCode: 'ESEWA_SIGNATURE_MISMATCH', message: 'Payment verification failed' });
      }

      if (payload.status !== 'COMPLETE') {
        throw new BadRequestException({ errorCode: 'PAYMENT_NOT_COMPLETE', message: `eSewa payment status: ${payload.status}` });
      }

      const parts = payload.transaction_uuid.split('-');
      const invoiceId = parts.slice(1, -1).join('-');

      const invoice = await this.prismaService.invoice.findFirst({
        where: { id: invoiceId, tenant_id: tenantId },
        include: { customer: true },
      });

      if (!invoice) {
        throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found for this payment' });
      }

      const existing = await this.prismaService.payment.findFirst({
        where: { gateway_ref_id: payload.transaction_code },
      });

      if (existing) {
        this.logger.warn({ event: 'payment.esewa_duplicate', txnCode: payload.transaction_code });
        return { success: true, message: 'Payment already recorded' };
      }

      const amountPaisa = Math.round(parseFloat(payload.total_amount) * 100);

      const payment = await this.prismaService.payment.create({
        data: {
          invoice_id: invoiceId,
          customer_id: invoice.customerId,
          tenant_id: tenantId,
          gateway: PAYMENTGATEWAY.ESEWA,
          transaction_id: payload.transaction_uuid,
          gateway_ref_id: payload.transaction_code,
          amount: amountPaisa,
          raw_payload: payload as any,
        },
      });

      await this.reconcileInvoiceStatus(invoiceId, tenantId);

      // Track Metrics
      this.paymentSuccessCounter.inc({ gateway: 'ESEWA', status: 'SUCCESS' });
      this.paymentRevenueCounter.inc({ gateway: 'ESEWA' }, parseFloat(payload.total_amount));

      // Asynchronously queue receipt PDF and email dispatch
      await this.queueReceiptEmail(
        payment.id,
        invoiceId,
        invoice.customer.email,
        invoice.customer.fullName,
        amountPaisa,
        'eSewa',
        payload.transaction_code,
        tenantId,
      );

      this.logger.log({
        event: 'payment.esewa_recorded',
        invoiceId,
        amountNPR: parseFloat(payload.total_amount),
        txnCode: payload.transaction_code,
      });

      return { success: true, message: 'eSewa payment recorded successfully' };
    } finally {
      timer();
    }
  }

  // ---------------------------------------------------------------------------
  // Khalti — Step 1: Initiate payment
  // ---------------------------------------------------------------------------
  async initiateKhaltiPayment(invoiceId: string, tenantId: string) {
    const invoice = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
      include: { customer: true },
    });

    if (!invoice) {
      throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    if (invoice.status === INVOICESTATUS.PAID) {
      throw new BadRequestException({ errorCode: 'INVOICE_ALREADY_PAID', message: 'This invoice is already fully paid' });
    }

    const response = await fetch(`${this.khaltiBaseUrl}/api/v2/epayment/initiate/`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${this.khaltiSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        return_url: `${this.appUrl}/payment/khalti/callback?tenant_id=${tenantId}`,
        website_url: this.appUrl,
        amount: invoice.amount,
        purchase_order_id: invoiceId,
        purchase_order_name: `Invoice #${invoiceId}`,
        customer_info: {
          name: invoice.customer.fullName,
          email: invoice.customer.email,
          phone: invoice.customer.phoneNumber,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      this.logger.error({ event: 'payment.khalti_initiate_failed', error });
      throw new BadRequestException({ errorCode: 'KHALTI_INITIATE_FAILED', message: 'Failed to initiate Khalti payment' });
    }

    const data = (await response.json()) as { pidx: string; payment_url: string };

    this.logger.log({ event: 'payment.khalti_initiated', invoiceId, pidx: data.pidx });

    return {
      paymentUrl: data.payment_url,
      pidx: data.pidx,
    };
  }

  // ---------------------------------------------------------------------------
  // Khalti — Step 2: Verify callback via server-to-server lookup
  // ---------------------------------------------------------------------------
  async handleKhaltiCallback(pidx: string, purchaseOrderId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    const timer = this.paymentDurationHistogram.startTimer({ gateway: 'KHALTI' });
    try {
      const response = await fetch(`${this.khaltiBaseUrl}/api/v2/epayment/lookup/`, {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.khaltiSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pidx }),
      });

      if (!response.ok) {
        this.logger.error({ event: 'payment.khalti_lookup_failed', pidx });
        throw new BadRequestException({ errorCode: 'KHALTI_LOOKUP_FAILED', message: 'Could not verify Khalti payment' });
      }

      const lookup = (await response.json()) as KhaltiLookupResponse;

      if (lookup.status !== 'Completed') {
        throw new BadRequestException({
          errorCode: 'PAYMENT_NOT_COMPLETE',
          message: `Khalti payment status: ${lookup.status}. Expected: Completed`,
        });
      }

      if (lookup.purchase_order_id !== purchaseOrderId) {
        throw new BadRequestException({ errorCode: 'ORDER_MISMATCH', message: 'Payment order ID does not match' });
      }

      const invoice = await this.prismaService.invoice.findFirst({
        where: { id: purchaseOrderId, tenant_id: tenantId },
        include: { customer: true },
      });

      if (!invoice) {
        throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
      }

      const existing = await this.prismaService.payment.findFirst({
        where: { gateway_ref_id: lookup.transaction_id },
      });

      if (existing) {
        return { success: true, message: 'Payment already recorded' };
      }

      const payment = await this.prismaService.payment.create({
        data: {
          invoice_id: purchaseOrderId,
          customer_id: invoice.customerId,
          tenant_id: tenantId,
          gateway: PAYMENTGATEWAY.KHALTI,
          transaction_id: pidx,
          gateway_ref_id: lookup.transaction_id,
          amount: lookup.total_amount,
          fee: lookup.fee,
          raw_payload: lookup as any,
        },
      });

      await this.reconcileInvoiceStatus(purchaseOrderId, tenantId);

      // Track Prometheus Metrics
      this.paymentSuccessCounter.inc({ gateway: 'KHALTI', status: 'SUCCESS' });
      this.paymentRevenueCounter.inc({ gateway: 'KHALTI' }, lookup.total_amount / 100);

      // Asynchronously queue receipt PDF and email dispatch
      await this.queueReceiptEmail(
        payment.id,
        purchaseOrderId,
        invoice.customer.email,
        invoice.customer.fullName,
        lookup.total_amount,
        'Khalti',
        lookup.transaction_id,
        tenantId,
      );

      this.logger.log({
        event: 'payment.khalti_recorded',
        invoiceId: purchaseOrderId,
        amountPaisa: lookup.total_amount,
        txnId: lookup.transaction_id,
      });

      return { success: true, message: 'Khalti payment recorded successfully' };
    } finally {
      timer();
    }
  }
}
