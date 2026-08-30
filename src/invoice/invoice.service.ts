import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CreateInvoiceDTO } from './dto/create-invoice-dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Invoice, Prisma } from '@prisma/client';
import { computeRequestHash } from '../common/idempotency/hash.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaginationResponseDto } from '../common/dto/pagination-response.dto.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    @InjectQueue('invoice-queue') private readonly invoiceQueue: Queue,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private async getInvoiceVersion(tenantId: string) {
    const key = `tenant:${tenantId}:invoices:version`;
    const version = await this.cacheManager.get<number>(key);
    if (!version) {
      await this.cacheManager.set(key, 1, 60 * 60 * 24 * 1000); // 24h
      return 1;
    }
    return version;
  }
  private async bumpInvoiceVersion(tenantId: string) {
    const key = `tenant:${tenantId}:invoices:version`;
    const version = await this.getInvoiceVersion(tenantId);
    await this.cacheManager.set(key, version + 1, 60 * 60 * 24 * 1000);
  }

  async createInvoice(
    dto: CreateInvoiceDTO,
    idempotencyKey: string,
    ownerType?: string,
    ownerId?: string,
    tenantId?: string,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('idempotency key is required');

    const effectiveTenantId = tenantId || ownerId;
    if (!effectiveTenantId) {
      throw new BadRequestException('tenant context is required');
    }

    const requestHash = computeRequestHash(
      'POST',
      'api/v1/invoice/new',
      dto,
      effectiveTenantId,
    );

    const claim = await this.idempotencyService.claimKeyIfNotExists(
      idempotencyKey,
      requestHash,
      ownerType,
      effectiveTenantId,
    );

    if (!claim.created) {
      const record = claim.record;
      if (record?.status === 'DONE') {
        if (record?.requestHash !== requestHash) {
          throw new ConflictException({
            errorCode: 'IDEMPOTENCY_KEY_CONFLICT',
            message: 'Idempotency key used with a different request payload',
          });
        }
        return record.response;
      }
      if (record?.status === 'PROCESSING') {
        throw new ConflictException({
          errorCode: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'Request with this key is already in process',
        });
      }
    }

    const { amount, due_date, customerData, customerId, status } = dto;

    const invoice = await this.prismaService.$transaction(async (prisma) => {
      let usedCustomerId = customerId;
      if (!customerId) {
        if (!customerData) {
          throw new BadRequestException({
            errorCode: 'INVALID_REQUEST',
            message: 'At least customerId or customerData is required',
          });
        }
        const customer = await prisma.customer.upsert({
          where: {
            tenant_id_email: {
              tenant_id: effectiveTenantId,
              email: customerData.email,
            },
          },
          update: {
            fullName: customerData.fullName,
            phoneNumber: customerData.phoneNumber,
          },
          create: {
            email: customerData.email,
            fullName: customerData.fullName,
            phoneNumber: customerData.phoneNumber,
            tenant_id: effectiveTenantId,
          },
        });
        usedCustomerId = customer.id;
      } else {
        const exists = await prisma.customer.findFirst({
          where: { id: customerId, tenant_id: effectiveTenantId },
        });
        if (!exists) {
          throw new NotFoundException({
            errorCode: 'CUSTOMER_NOT_FOUND',
            message: 'Provided customerId was not found in your organization',
          });
        }
      }

      const createdInvoice = await prisma.invoice.create({
        data: {
          amount: Math.round(amount),
          due_date: new Date(due_date),
          customerId: usedCustomerId!,
          status: status,
          tenant_id: effectiveTenantId,
        },
      });
      return createdInvoice;
    });

    await this.idempotencyService.markDone(idempotencyKey, {
      status: 201,
      body: invoice,
    });

    // Dispatch background job for async processing (e.g. generating PDF, sending email)
    // By offloading this to BullMQ, the HTTP request completes instantly.
    await this.invoiceQueue.add(
      'generate-and-send-invoice',
      {
        invoiceId: invoice.id,
        customerEmail: customerData?.email || 'customer@example.com',
        tenantId: invoice.tenant_id,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    await this.bumpInvoiceVersion(effectiveTenantId);

    return invoice;
  }

  async findById(invoiceId: string, tenantId: string) {
    return this.prismaService.invoice.findFirst({
      where: {
        id: invoiceId,
        tenant_id: tenantId,
      },
      include: {
        customer: true,
      },
    });
  }

  async getInvoiceByCustomerEmail(email: string, tenantId: string) {
    const version = await this.getInvoiceVersion(tenantId);
    const cacheKey = `v:${version}:tenant:${tenantId}:customer:${email}:invoice`;
    const cachedInvoice = await this.cacheManager.get<any>(cacheKey);
    if (cachedInvoice) {
      return cachedInvoice;
    }
    const invoice = await this.prismaService.invoice.findFirst({
      where: {
        tenant_id: tenantId,
        customer: {
          email: email,
        },
      },
      include: {
        customer: true,
      },
    });
    await this.cacheManager.set(cacheKey, invoice, 60 * 1000); //1 minute
    return invoice;
  }

  async findAll(
    tenantId: string,
    paginationQueryDto: PaginationQueryDto,
  ): Promise<PaginationResponseDto<Invoice>> {
    const version = await this.getInvoiceVersion(tenantId);
    const cacheKey = `v:${version}:tenant:${tenantId}:invoices:take:${paginationQueryDto.take}:skip:${paginationQueryDto.skip}`;
    const cachedInvoices =
      await this.cacheManager.get<PaginationResponseDto<Invoice>>(cacheKey);
    if (cachedInvoices) {
      return new PaginationResponseDto(
        cachedInvoices.data,
        cachedInvoices.meta.total,
        cachedInvoices.meta.page,
        cachedInvoices.meta.limit,
      );
    }
    const whereClause = tenantId ? { tenant_id: tenantId } : {};
    const [invoices, total] = await this.prismaService.$transaction([
      this.prismaService.invoice.findMany({
        where: whereClause,
        skip: paginationQueryDto.skip,
        take: paginationQueryDto.take,
        include: {
          payments: true,
          customer: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.invoice.count({ where: whereClause }),
    ]);

    const paginatedResponse = new PaginationResponseDto(
      invoices,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
    await this.cacheManager.set(cacheKey, paginatedResponse, 5 * 60 * 1000);
    return paginatedResponse;
  }
}
