import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import bcrypt from 'bcrypt';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { PaginationResponseDto } from '../common/dto/pagination-response.dto.js';
import { User } from '@prisma/client';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class UserService {
  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  private getUserCacheKey(tenantId: string, id: string) {
    return `tenant:${tenantId}:user:${id}`;
  }
  private getUserListCacheKey(
    tenantId: string,
    take: number,
    skip: number,
    version: number,
  ) {
    return `v:${version}:tenant:${tenantId}:user:list:take:${take}:skip:${skip}`;
  }

  //helper for returning the version number
  private async getUserVersion(tenantId: string): Promise<number> {
    const versionKey = `tenant:${tenantId}:users:version`;
    const version = await this.cacheManager.get<number>(versionKey);
    if (!version) {
      await this.cacheManager.set(versionKey, 1, 60 * 60 * 24 * 1000); // 24h
      return 1;
    }
    return version;
  }

  //helper for bumping the version number (increase version)
  private async bumpUserVersion(tenantId: string): Promise<void> {
    const versionKey = `tenant:${tenantId}:users:version`;
    const current = await this.getUserVersion(tenantId);
    await this.cacheManager.set(versionKey, current + 1, 60 * 60 * 24 * 1000);
  }

  async create(createUserDto: CreateUserDto, tenantId?: string) {
    const effectiveTenantId = createUserDto.tenant_id || tenantId;
    if (!effectiveTenantId) {
      throw new BadRequestException('tenant_id is required to create a user');
    }

    const existing = await this.prismaService.user.findUnique({
      where: { email: createUserDto.email },
    });
    if (existing) {
      throw new ConflictException({
        errorCode: 'EMAIL_ALREADY_EXISTS',
        message: 'A user with this email address already exists',
      });
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prismaService.user.create({
      data: {
        fullName: createUserDto.fullName,
        email: createUserDto.email,
        password: hashedPassword,
        phoneNumber: createUserDto.phoneNumber,
        role: createUserDto.role || 'BILLING',
        tenant_id: effectiveTenantId,
      },
    });

    const { password, ...safeUser } = user;
    await this.bumpUserVersion(effectiveTenantId);
    return safeUser;
  }

  async findAll(
    tenantId: string,
    paginationQueryDto: PaginationQueryDto,
  ): Promise<PaginationResponseDto<Partial<User>>> {
    const version = await this.getUserVersion(tenantId);
    const cacheKey = this.getUserListCacheKey(
      tenantId,
      paginationQueryDto.take,
      paginationQueryDto.skip,
      version,
    );
    const cachedUsers =
      await this.cacheManager.get<PaginationResponseDto<User>>(cacheKey);
    if (cachedUsers) {
      return cachedUsers;
    }
    const whereClause = tenantId ? { tenant_id: tenantId } : {};

    const [users, total] = await this.prismaService.$transaction([
      this.prismaService.user.findMany({
        where: whereClause,
        select: {
          id: true,
          fullName: true,
          email: true,
          phoneNumber: true,
          role: true,
          is_enabled: true,
          created_at: true,
          updated_at: true,
          tenant_id: true,
        },
        take: paginationQueryDto.take,
        skip: paginationQueryDto.skip,
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.user.count({ where: whereClause }),
    ]);
    const paginatedResponse = new PaginationResponseDto(
      users,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
    await this.cacheManager.set(cacheKey, paginatedResponse, 60 * 1000);
    return paginatedResponse;
  }

  async findOne(id: string, tenantId: string) {
    if (!id) throw new BadRequestException('userid is required');
    const cacheKey = this.getUserCacheKey(tenantId, id);
    const cachedUser = await this.cacheManager.get(cacheKey);
    if (cachedUser) {
      return cachedUser;
    }
    const whereClause = { id, tenant_id: tenantId };

    const user = await this.prismaService.user.findFirst({
      where: whereClause,
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        role: true,
        is_enabled: true,
        created_at: true,
        updated_at: true,
        tenant_id: true,
      },
    });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
    await this.cacheManager.set(cacheKey, user, 10 * 60 * 1000);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, tenantId: string) {
    if (!id) throw new BadRequestException('userid is required');
    await this.findOne(id, tenantId);

    const dataToUpdate: Partial<User> = { ...updateUserDto };
    if (dataToUpdate.password) {
      dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
    }

    const updatedUser = await this.prismaService.user.update({
      where: { id },
      data: dataToUpdate,
    });
    await this.cacheManager.del(this.getUserCacheKey(tenantId, id));
    await this.bumpUserVersion(tenantId);

    const { password, ...safeUser } = updatedUser;
    return safeUser;
  }

  async remove(id: string, tenantId: string) {
    if (!id) throw new BadRequestException('userid is required');
    await this.findOne(id, tenantId);
    await this.cacheManager.del(this.getUserCacheKey(tenantId, id));
    await this.bumpUserVersion(tenantId);
    return this.prismaService.user.delete({ where: { id } });
  }
}
