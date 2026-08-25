import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaginationResponseDto } from '../common/dto/pagination-response.dto.js';
import { Customer } from '@prisma/client';

@Injectable()
export class CustomerService {
  constructor(private readonly prismaService: PrismaService) {}

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

    return new PaginationResponseDto(
      customers,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
  }

  async findOne(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('customerId is required');
    const whereClause = tenantId ? { id, tenant_id: tenantId } : { id };

    const customer = await this.prismaService.customer.findFirst({
      where: whereClause,
      include: { invoices: true, payments: true },
    });
    if (!customer)
      throw new NotFoundException(`Customer with id ${id} not found`);
    return customer;
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
    tenantId?: string,
  ) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id, tenantId);

    return this.prismaService.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  async remove(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id, tenantId);

    return this.prismaService.customer.delete({
      where: { id },
    });
  }
}
