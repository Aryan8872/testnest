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
import { TENANTSTATUS } from '@prisma/client';

@Injectable()
export class TenantService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getTenantCacheKey(id: string) {
    return `tenant:${id}`;
  }

  private async getTenantListVersion(): Promise<number> {
    const versionKey = 'tenant:version:global';
    const version = await this.cacheManager.get<number>(versionKey);
    if (!version) {
      await this.cacheManager.set(versionKey, 1, 60 * 60 * 24 * 1000); // 24h
      return 1;
    }
    return version;
  }

  private async bumpTenantListVersion(): Promise<void> {
    const versionKey = 'tenant:version:global';
    const current = await this.getTenantListVersion();
    await this.cacheManager.set(versionKey, current + 1, 60 * 60 * 24 * 1000);
  }

  private getTenantListCacheKey(page: number, limit: number, version: number) {
    return `v:${version}:tenant:list:page:${page}:limit:${limit}`;
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
        message: 'A tenant organization with this email address already exists',
      });
    }

    const tenant = await this.prismaService.tenant.create({
      data: {
        ...createTenantDto,
      },
    });

    await this.bumpTenantListVersion();
    return tenant;
  }

  async findAll(paginationQueryDto: PaginationQueryDto) {
    const version = await this.getTenantListVersion();
    const cacheKey = this.getTenantListCacheKey(
      paginationQueryDto.page,
      paginationQueryDto.limit,
      version,
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
    if (!tenant) {
      throw new NotFoundException(`Tenant organization with ID ${id} not found`);
    }

    await this.cacheManager.set(cacheKey, tenant, 24 * 60 * 60 * 1000);
    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    if (!id) throw new BadRequestException('Tenant ID is required');
    await this.findOne(id);

    if (updateTenantDto.email) {
      const duplicate = await this.prismaService.tenant.findFirst({
        where: { email: updateTenantDto.email, NOT: { id } },
      });
      if (duplicate) {
        throw new ConflictException({
          errorCode: 'EMAIL_ALREADY_EXISTS',
          message: 'Another tenant organization already uses this email address',
        });
      }
    }

    const updated = await this.prismaService.tenant.update({
      where: { id },
      data: updateTenantDto,
    });

    await this.cacheManager.del(this.getTenantCacheKey(id));
    await this.bumpTenantListVersion();
    return updated;
  }

  /**
   * Enterprise Soft-Delete / Deactivation for Tenant Organizations
   * Sets status to DEACTIVATED and invalidates auth cache rather than hard-deleting
   * to preserve audit trails and avoid cascading database foreign key exceptions.
   */
  async remove(id: string) {
    if (!id) throw new BadRequestException('Tenant ID is required');
    await this.findOne(id);

    const deactivated = await this.prismaService.tenant.update({
      where: { id },
      data: { status: TENANTSTATUS.DEACTIVATED },
    });

    await this.cacheManager.del(this.getTenantCacheKey(id));
    await this.bumpTenantListVersion();

    return {
      success: true,
      message: `Tenant organization '${deactivated.fullName}' (${id}) has been deactivated.`,
    };
  }
}
