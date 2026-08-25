import {
  BadRequestException,
  ConflictException,
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

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}

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
    return safeUser;
  }

  async findAll(
    tenantId: string,
    paginationQueryDto: PaginationQueryDto,
  ): Promise<PaginationResponseDto<Partial<User>>> {
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
    return new PaginationResponseDto(
      users,
      total,
      paginationQueryDto.page,
      paginationQueryDto.limit,
    );
  }

  async findOne(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('userid is required');
    const whereClause = tenantId ? { id, tenant_id: tenantId } : { id };

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
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, tenantId?: string) {
    if (!id) throw new BadRequestException('userid is required');
    await this.findOne(id, tenantId);

    const dataToUpdate: any = { ...updateUserDto };
    if (dataToUpdate.password) {
      dataToUpdate.password = await bcrypt.hash(dataToUpdate.password, 10);
    }

    const updatedUser = await this.prismaService.user.update({
      where: { id },
      data: dataToUpdate,
    });

    const { password, ...safeUser } = updatedUser;
    return safeUser;
  }

  async remove(id: string, tenantId?: string) {
    if (!id) throw new BadRequestException('userid is required');
    await this.findOne(id, tenantId);
    return this.prismaService.user.delete({ where: { id } });
  }
}
