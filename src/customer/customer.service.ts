import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaginationResponseDto } from '../common/dto/pagination-response.dto.js';
import { Customer } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  //helper for returning the version number
  private async getCustomerVersion(tenantId: string): Promise<number> {
    const versionKey = `tenant:${tenantId}:customers:version`;
    const version = await this.cacheManager.get<number>(versionKey);
    if (!version) {
      await this.cacheManager.set(versionKey, 1, 60 * 60 * 24 * 1000); // 24h
      return 1;
    }
    return version;
  }

  //helper for bumping the version number (increase version)
  private async bumpCustomerVersion(tenantId: string): Promise<void> {
    const versionKey = `tenant:${tenantId}:customers:version`;
    const current = await this.getCustomerVersion(tenantId);
    await this.cacheManager.set(versionKey, current + 1, 60 * 60 * 24 * 1000);
  }

  async create(createCustomerDto: CreateCustomerDto, tenantId: string) {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    return this.prismaService.customer.create({
      data: {
        ...createCustomerDto,
        tenant_id: tenantId,
      },
    });
  }

  async findAll(
    tenantId: string,
    paginationQueryDto: PaginationQueryDto,
  ): Promise<PaginationResponseDto<Customer>> {
    const whereClause = tenantId ? { tenant_id: tenantId } : {};
    const version = await this.getCustomerVersion(tenantId);
    const cacheKey = `v:${version}tenant:${tenantId}:customer:all:take:${paginationQueryDto.take}:skip:${paginationQueryDto.skip}:profiles`;

    const cachedCustomers: PaginationResponseDto<Customer> | undefined =
      await this.cacheManager.get(cacheKey);
    if (!cachedCustomers) {
      const [customers, total] = await this.prismaService.$transaction([
        this.prismaService.customer.findMany({
          where: whereClause,
          take: paginationQueryDto.take,
          skip: paginationQueryDto.skip,
          orderBy: {
            created_at: 'desc',
          },
        }),
        this.prismaService.customer.count({ where: whereClause }),
      ]);
      const paginationResponse = new PaginationResponseDto(
        customers,
        total,
        paginationQueryDto.page,
        paginationQueryDto.limit,
      );
      await this.cacheManager.set(cacheKey, paginationResponse, 5 * 60 * 1000); //5 minutes
      return paginationResponse;
    }
    return new PaginationResponseDto(
      cachedCustomers.data,
      cachedCustomers.meta.total,
      cachedCustomers.meta.page,
      cachedCustomers.meta.limit,
    );
  }

  async findOne(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('customerId is required');
    const whereClause = tenantId ? { id, tenant_id: tenantId } : { id };
    const cacheKey = `tenant:${tenantId ?? 'global'}:customer:${id}:profile`;

    const cachedCustomer = await this.cacheManager.get<Customer>(cacheKey);
    if (!cachedCustomer) {
      const customer = await this.prismaService.customer.findFirst({
        where: whereClause,
        include: { invoices: true, payments: true },
      });
      if (!customer)
        throw new NotFoundException(`Customer with id ${id} not found`);
      await this.cacheManager.set(cacheKey, customer, 60_000);
      return customer;
    }
    return cachedCustomer;
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    tenantId?: string,
  ) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id, tenantId);
    const cacheKey = `tenant:${tenantId ?? 'global'}:customer:${id}:profile`;
    const updatedCustomer = await this.prismaService.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
    // . Invalidate all paginated lists for this tenant and increase the version
    if (tenantId) {
      await this.bumpCustomerVersion(tenantId);
    }
    await this.cacheManager.del(cacheKey);
    return updatedCustomer;
  }

  async remove(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id, tenantId);
    const cacheKey = `tenant:${tenantId ?? 'global'}:customer:${id}:profile`;

    const customer = await this.prismaService.customer.delete({
      where: { id },
    });
    // 2. Invalidate all paginated lists for this tenant
    if (tenantId) {
      await this.bumpCustomerVersion(tenantId);
    }
    await this.cacheManager.del(cacheKey);
    return customer;
  }
}
