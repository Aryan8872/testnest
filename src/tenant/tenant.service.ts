import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TenantService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(createTenantDto: CreateTenantDto) {
    const existing = await this.prismaService.tenant.findUnique({
      where: {
        email: createTenantDto.email,
      },
    });
    if (existing) {
      throw new ConflictException({
        errorCode: 'EMAIL_ALREADY_EXISTS',
        message: 'tenant with the email already exists',
      });
    }
    return await this.prismaService.tenant.create({
      data: {
        ...createTenantDto,
      },
    });
  }

  async findAll(limit = 10, pageNum = 1) {
    const page = Number(pageNum) || 1;
    const limitNum = Number(limit);
    if (page < 1) {
      throw new BadRequestException({
        errorCode: 'INVALID_PAGE',
        message: 'page must be greater or equal to 1',
      });
    }
    if (limit < 0 || limit > 100) {
      throw new BadRequestException({
        errorCode: 'INVALID_LIMIT',
        message: 'limit must be greater than 0 and less than 100 ',
      });
    }
    const skip = (page - 1) * limitNum;
    const [tenants, total] = await this.prismaService.$transaction([
      this.prismaService.tenant.findMany({
        take: limitNum,
        skip,
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.tenant.count(),
    ]);
    return {
      items: tenants,
      meta: {
        total,
        page,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string) {
    const tenant = await this.prismaService.tenant.findUnique({
      where: { id },
    });
    if (!tenant) throw new NotFoundException();
    return tenant;
  }

  update(id: number, updateTenantDto: UpdateTenantDto) {
    return `This action updates a #${id} tenant`;
  }

  remove(id: number) {
    return `This action removes a #${id} tenant`;
  }
}
