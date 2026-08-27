import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaginationResponseDto } from '../common/dto/pagination-response.dto.js';

@Injectable()
export class TenantService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}
  private getTenantCacheKey(id: string) {
    return `tenant:${id}`;
  }
  private getTenantListCacheKey(page: number, limit: number) {
    return `tenant:list:page:${page}:limit:${limit}`;
  }
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

  async findAll(paginationQueryDto: PaginationQueryDto) {
    const cacheKey = this.getTenantListCacheKey(
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
    const cachedTenants = await this.cacheManager.get(cacheKey);
    if (cachedTenants) {
      return cachedTenants;
    }
    const [tenants, total] = await this.prismaService.$transaction([
      this.prismaService.tenant.findMany({
        take: paginationQueryDto.take,
        skip: paginationQueryDto.skip,
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.tenant.count(),
    ]);
    const paginationResponse = new PaginationResponseDto(
      tenants,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
    await this.cacheManager.set(cacheKey, paginationResponse, 5 * 60 * 1000);
    return paginationResponse;
  }

  async findOne(id: string) {
    const cacheKey = this.getTenantCacheKey(id);
    const cachedTenant = await this.cacheManager.get(cacheKey);
    if (cachedTenant) {
      return cachedTenant;
    }
    const tenant = await this.prismaService.tenant.findUnique({
      where: { id },
    });
    if (!tenant) throw new NotFoundException();
    await this.cacheManager.set(cacheKey, tenant, 24 * 60 * 60 * 1000);
    return tenant;
  }

  update(id: number, updateTenantDto: UpdateTenantDto) {
    return `This action updates a #${id} tenant`;
  }

  remove(id: number) {
    return `This action removes a #${id} tenant`;
  }
}
