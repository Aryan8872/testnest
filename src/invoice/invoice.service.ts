import {
  BadRequestException,
  ConflictException,
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

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly idempotencyService: IdempotencyService,
    @InjectQueue('invoice-queue') private readonly invoiceQueue: Queue,
  ) {}

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
        try {
          const created = await prisma.customer.create({
            data: {
              email: customerData.email,
              fullName: customerData.fullName,
              phoneNumber: customerData.phoneNumber,
              tenant_id: effectiveTenantId,
            },
          });
          usedCustomerId = created.id;
        } catch (e: any) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const existing = await prisma.customer.findFirst({
              where: {
                email: customerData.email,
                tenant_id: effectiveTenantId,
              },
            });
            if (!existing) {
              throw e;
            }
            usedCustomerId = existing?.id;
          } else {
            throw e;
          }
        }
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

    return invoice;
  }

  async getInvoiceByCustomerEmail(email: string, tenantId: string) {
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
    return invoice;
  }

  async findAll(
    tenantId: string,
    paginationQueryDto: PaginationQueryDto,
  ): Promise<PaginationResponseDto<Invoice>> {
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

    return new PaginationResponseDto(
      invoices,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
  }
}
