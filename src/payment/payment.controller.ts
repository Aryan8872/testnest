import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { JwtAuthGuard } from '../common/guards/authguard/jwt-auth.guard.js';
import { CurrentTenant } from '../decorators/current-tenant.decorator.js';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  // ─── eSewa ──────────────────────────────────────────────────────────────────

  /**
   * Step 1 for eSewa: Tenant user initiates payment for an invoice.
   * Returns a signed form payload the frontend submits to eSewa.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('initiate/esewa/:invoiceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate signed eSewa checkout payload for an invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID to pay' })
  @ApiResponse({ status: 200, description: 'eSewa form payload returned' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  @ApiResponse({ status: 400, description: 'Invoice already paid or cancelled' })
  initiateEsewaPayment(
    @Param('invoiceId') invoiceId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.paymentService.initiateEsewaPayment(invoiceId, tenantId);
  }

  /**
   * Step 2 for eSewa: eSewa redirects the customer back here with ?data=<base64>
   * This endpoint decodes, verifies the HMAC signature, and records the payment.
   *
   * NOTE: This is a GET because eSewa sends a redirect (not a POST webhook).
   * In production, the frontend would hit this URL or it acts as the success_url.
   */
  @Get('esewa/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'eSewa payment success callback (called by eSewa redirect)' })
  @ApiQuery({ name: 'data', description: 'Base64 encoded eSewa payment data' })
  @ApiQuery({ name: 'tenant_id', description: 'Tenant ID from query (injected by success_url construction)' })
  @ApiResponse({ status: 200, description: 'Payment verified and recorded' })
  @ApiResponse({ status: 400, description: 'Signature mismatch or invalid data' })
  handleEsewaCallback(
    @Query('data') encodedData: string,
    @Query('tenant_id') tenantId: string,
  ) {
    if (!encodedData) {
      throw new BadRequestException({
        errorCode: 'MISSING_ESEWA_DATA',
        message: 'eSewa callback missing data parameter',
      });
    }
    if (!tenantId) {
      throw new BadRequestException({
        errorCode: 'MISSING_TENANT_ID',
        message: 'Tenant ID is required in callback',
      });
    }
    return this.paymentService.handleEsewaCallback(encodedData, tenantId);
  }

  /**
   * eSewa failure redirect
   */
  @Get('esewa/failure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'eSewa payment failure callback' })
  handleEsewaFailure() {
    return { success: false, message: 'Payment was cancelled or failed. Please try again.' };
  }

  // ─── Khalti ─────────────────────────────────────────────────────────────────

  /**
   * Step 1 for Khalti: Initiate a Khalti payment.
   * Returns a payment_url to redirect the customer to.
   */
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('initiate/khalti/:invoiceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate Khalti payment for an invoice' })
  @ApiParam({ name: 'invoiceId', description: 'Invoice ID to pay' })
  @ApiResponse({ status: 200, description: 'Khalti payment URL returned' })
  @ApiResponse({ status: 404, description: 'Invoice not found' })
  initiateKhaltiPayment(
    @Param('invoiceId') invoiceId: string,
    @CurrentTenant() tenantId: string,
  ) {
    return this.paymentService.initiateKhaltiPayment(invoiceId, tenantId);
  }

  /**
   * Step 2 for Khalti: Customer returns from Khalti checkout with ?pidx=xxx
   * We perform a server-to-server lookup to verify the transaction — NEVER trust client data.
   */
  @Get('khalti/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Khalti payment callback — performs server-to-server verification' })
  @ApiQuery({ name: 'pidx', description: 'Khalti payment index token' })
  @ApiQuery({ name: 'purchase_order_id', description: 'Invoice ID (set as purchase_order_id during initiation)' })
  @ApiQuery({ name: 'tenant_id', description: 'Tenant ID from callback URL' })
  @ApiResponse({ status: 200, description: 'Payment verified and recorded' })
  @ApiResponse({ status: 400, description: 'Payment not completed or lookup failed' })
  async handleKhaltiCallback(
    @Query('pidx') pidx: string,
    @Query('purchase_order_id') purchaseOrderId: string,
    @Query('tenant_id') tenantId: string,
  ) {
    if (!pidx || !purchaseOrderId || !tenantId) {
      throw new BadRequestException({
        errorCode: 'MISSING_CALLBACK_PARAMS',
        message: 'pidx, purchase_order_id and tenant_id are required',
      });
    }
    return this.paymentService.handleKhaltiCallback(pidx, purchaseOrderId, tenantId);
  }
}
