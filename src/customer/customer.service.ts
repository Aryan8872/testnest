import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CustomerService {
  constructor(private readonly prismaService: PrismaService) {}

  async create(createCustomerDto: CreateCustomerDto) {
    return this.prismaService.customer.create({
      data: createCustomerDto,
    });
  }

  async findAll(page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [customers, total] = await this.prismaService.$transaction([
      this.prismaService.customer.findMany({
        take: limitNum,
        skip: skip,
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.customer.count(),
    ]);

    return {
      items: customers,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string) {
    if (!id) throw new BadRequestException('customerId is required');
    const customer = await this.prismaService.customer.findUnique({
      where: { id },
      include: { invoices: true, payments: true },
    });
    if (!customer)
      throw new NotFoundException(`Customer with id ${id} not found`);
    return customer;
  }

  async update(id: string, updateCustomerDto: UpdateCustomerDto) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id);
    return this.prismaService.customer.update({
      where: { id },
      data: updateCustomerDto,
    });
  }

  async remove(id: string) {
    if (!id) throw new BadRequestException('customerId is required');
    await this.findOne(id);
    return this.prismaService.customer.delete({
      where: { id },
    });
  }
}
