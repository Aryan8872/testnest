import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateInvoiceDTO } from './dto/create-invoice-dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';
import { computeRequestHash } from '../common/idempotency/hash.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly idempotencyService: IdempotencyService,
  ) {}
  async createInvoice(
    dto: CreateInvoiceDTO,
    idempotencyKey: string,
    ownerType?: string,
    ownerId?: string,
  ) {
    if (!idempotencyKey)
      throw new BadRequestException('idempotency key is required');
    const requestHash = computeRequestHash('POST', 'api/v1/invoice/new', dto);
    const claim = await this.idempotencyService.claimKeyIfNotExists(
      idempotencyKey,
      requestHash,
    );
    //if not created returns the existing record from the db, now we need to check the hash
    if (!claim.created) {
      const record = claim.record;
      if (record?.status === 'DONE') {
        if (record?.requestHash !== requestHash) {
          //we cant use the same key twice for 2 different request so we throw exception
          throw new ConflictException({
            errorCode: 'IDEMPOTENCY_KEY_CONFLIC',
            message: 'idempotency key used in diffrent request',
          });
        }
        //if the hash are the same we return the existing response we got from the table
        return record.response;
      }
      if (record?.status === 'PROCESSING') {
        // the request is processing
        throw new ConflictException({
          errorCode: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'request with this key is in process',
        });
      }
    }

    // If we are here: we created the idempotency record => we must process and update record atomically.
    // Use a single transaction to create customer/invoice and then mark done

    const { amount, due_date, customerData, customerId, status } = dto;

    const invoice = await this.prismaService.$transaction(async (prisma) => {
      let usedCustomerId = customerId;
      if (!customerId) {
        if (!customerData) {
          throw new BadRequestException({
            errorCode: 'INVALID_REQUEST',
            message: 'at least customer id or the customer data is required',
          });
        }
        try {
          const created = await prisma.customer.create({
            data: {
              email: customerData.email,
              fullName: customerData.fullName,
              phoneNumber: customerData.phoneNumber,
            },
          });
          usedCustomerId = created.id;
        } catch (e: any) {
          if (
            e instanceof Prisma.PrismaClientKnownRequestError &&
            e.code === 'P2002'
          ) {
            const existing = await prisma.customer.findUnique({
              where: { email: customerData.email },
            });
            if (!existing) {
              //rethrow to be handled by global exception filter
              throw e;
            }
            usedCustomerId = existing?.id;
          } else {
            throw e;
          }
        }
      } else {
        const exists = await prisma.customer.findUnique({
          where: { id: customerId },
        });
        if (!exists) {
          throw new NotFoundException({
            errorCode: 'CUSTOMER_NOT_FOUND',
            message: 'Provided customerId was not found',
          });
        }
      }
      const createdInvoice = await prisma.invoice.create({
        data: {
          amount: Math.round(amount),
          due_date: new Date(due_date),
          customerId: usedCustomerId!,
          status: status,
        },
      });
      return createdInvoice;
    });

    await this.idempotencyService.markDone(idempotencyKey, {
      status: 201,
      body: invoice,
    });

    return invoice;
  }
}

