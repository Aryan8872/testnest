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
    const current = await this.cacheManager.get<number>(key) ?? 0;
    await this.cacheManager.set(key, current + 1, 0); // 0 = no expiry
  }

  // ---------------------------------------------------------------------------
  // HELPER — eSewa HMAC-SHA256 signature
  // Per eSewa v2 docs: message = "total_amount=X,transaction_uuid=Y,product_code=Z"
  // ---------------------------------------------------------------------------
  private signEsewa(totalAmount: number, txnUuid: string): string {
    const message = `total_amount=${totalAmount},transaction_uuid=${txnUuid},product_code=${this.esewaMerchantCode}`;
    return createHmac('sha256', this.esewaSecretKey)
      .update(message)
      .digest('base64');
  }

  // ---------------------------------------------------------------------------
  // HELPER — verify eSewa callback signature (server-side callback verification)
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
  // Called after every successful payment record insertion
  // ---------------------------------------------------------------------------
  private async reconcileInvoiceStatus(invoiceId: string, tenantId: string): Promise<void> {
    const invoice = await this.prismaService.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: { select: { amount: true } } },
    });

    if (!invoice) return;

    // Sum in paisa — amount stored as paisa in Payment, invoice.amount as paisa
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
  // eSewa — Step 1: Generate signed checkout form payload
  // Frontend renders this as hidden fields in an HTML form
  // POST to https://rc-epay.esewa.com.np/api/epay/main/v2/form
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

    // Amount in rupees (NPR) — invoice.amount stored in paisa, eSewa expects rupees
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
        success_url: `${this.appUrl}/payment/esewa/callback`,
        failure_url: `${this.appUrl}/payment/esewa/failure`,
        signed_field_names: 'total_amount,transaction_uuid,product_code',
        signature,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // eSewa — Step 2: Handle success callback (customer redirected back with ?data=<base64>)
  // Decode, verify signature, then record payment and reconcile invoice
  // ---------------------------------------------------------------------------
  async handleEsewaCallback(encodedData: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    let payload: EsewaCallbackPayload;
    try {
      const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
      payload = JSON.parse(decoded) as EsewaCallbackPayload;
    } catch {
      throw new BadRequestException({ errorCode: 'INVALID_ESEWA_PAYLOAD', message: 'Invalid eSewa callback data' });
    }

    // 1. Verify eSewa HMAC signature — reject tampered callbacks
    if (!this.verifyEsewaCallback(payload)) {
      this.logger.warn({ event: 'payment.esewa_signature_mismatch', payload });
      throw new BadRequestException({ errorCode: 'ESEWA_SIGNATURE_MISMATCH', message: 'Payment verification failed' });
    }

    if (payload.status !== 'COMPLETE') {
      throw new BadRequestException({ errorCode: 'PAYMENT_NOT_COMPLETE', message: `eSewa payment status: ${payload.status}` });
    }

    // 2. Extract invoiceId from transaction_uuid (format: INV-<invoiceId>-<timestamp>)
    const parts = payload.transaction_uuid.split('-');
    const invoiceId = parts.slice(1, -1).join('-'); // handles cuid with dashes

    const invoice = await this.prismaService.invoice.findFirst({
      where: { id: invoiceId, tenant_id: tenantId },
    });

    if (!invoice) {
      throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found for this payment' });
    }

    // 3. Idempotency — prevent duplicate payment recording for same eSewa txn
    const existing = await this.prismaService.payment.findFirst({
      where: { gateway_ref_id: payload.transaction_code },
    });

    if (existing) {
      this.logger.warn({ event: 'payment.esewa_duplicate', txnCode: payload.transaction_code });
      return { success: true, message: 'Payment already recorded' };
    }

    // 4. Record payment — amount in paisa (multiply NPR rupees by 100)
    const amountPaisa = Math.round(parseFloat(payload.total_amount) * 100);

    await this.prismaService.payment.create({
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

    // 5. Compute and update invoice status
    await this.reconcileInvoiceStatus(invoiceId, tenantId);

    this.logger.log({
      event: 'payment.esewa_recorded',
      invoiceId,
      amountNPR: parseFloat(payload.total_amount),
      txnCode: payload.transaction_code,
    });

    return { success: true, message: 'eSewa payment recorded successfully' };
  }

  // ---------------------------------------------------------------------------
  // Khalti — Step 1: Initiate payment, get payment_url to redirect customer
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
        return_url: `${this.appUrl}/payment/khalti/callback`,
        website_url: this.appUrl,
        amount: invoice.amount, // already in paisa
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

    const data = await response.json() as { pidx: string; payment_url: string };

    this.logger.log({ event: 'payment.khalti_initiated', invoiceId, pidx: data.pidx });

    return {
      paymentUrl: data.payment_url,
      pidx: data.pidx,
    };
  }

  // ---------------------------------------------------------------------------
  // Khalti — Step 2: Verify callback via server-to-server lookup (CRITICAL STEP)
  // Khalti redirects customer to return_url with ?pidx=xxx
  // We MUST call Khalti's lookup API to confirm — never trust client-side data
  // ---------------------------------------------------------------------------
  async handleKhaltiCallback(pidx: string, purchaseOrderId: string, tenantId: string): Promise<{ success: boolean; message: string }> {
    // 1. Server-to-server lookup with Khalti
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

    const lookup = await response.json() as KhaltiLookupResponse;

    // 2. Validate status
    if (lookup.status !== 'Completed') {
      throw new BadRequestException({
        errorCode: 'PAYMENT_NOT_COMPLETE',
        message: `Khalti payment status: ${lookup.status}. Expected: Completed`,
      });
    }

    // 3. Validate purchase_order_id matches (prevent IDOR attacks)
    if (lookup.purchase_order_id !== purchaseOrderId) {
      throw new BadRequestException({ errorCode: 'ORDER_MISMATCH', message: 'Payment order ID does not match' });
    }

    const invoice = await this.prismaService.invoice.findFirst({
      where: { id: purchaseOrderId, tenant_id: tenantId },
    });

    if (!invoice) {
      throw new NotFoundException({ errorCode: 'INVOICE_NOT_FOUND', message: 'Invoice not found' });
    }

    // 4. Idempotency — prevent double-recording
    const existing = await this.prismaService.payment.findFirst({
      where: { gateway_ref_id: lookup.transaction_id },
    });

    if (existing) {
      return { success: true, message: 'Payment already recorded' };
    }

    // 5. Record payment
    await this.prismaService.payment.create({
      data: {
        invoice_id: purchaseOrderId,
        customer_id: invoice.customerId,
        tenant_id: tenantId,
        gateway: PAYMENTGATEWAY.KHALTI,
        transaction_id: pidx,
        gateway_ref_id: lookup.transaction_id,
        amount: lookup.total_amount, // Khalti returns paisa
        fee: lookup.fee,
        raw_payload: lookup as any,
      },
    });

    // 6. Reconcile invoice status
    await this.reconcileInvoiceStatus(purchaseOrderId, tenantId);

    this.logger.log({
      event: 'payment.khalti_recorded',
      invoiceId: purchaseOrderId,
      amountPaisa: lookup.total_amount,
      txnId: lookup.transaction_id,
    });

    return { success: true, message: 'Khalti payment recorded successfully' };
  }
}
