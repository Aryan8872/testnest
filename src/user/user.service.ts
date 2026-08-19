import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UserService {
  constructor(private readonly prismaService: PrismaService) {}
  async create(createUserDto: CreateUserDto) {
    return await this.prismaService.user.create({ data: createUserDto });
  }

  async findAll(page = 1, limit = 20) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    if (pageNum < 1) {
      throw new BadRequestException({
        errorCode: 'INVALID_PAGE',
        message: 'page number must be greater than 0',
      });
    }
    if (limitNum < 1 || limitNum > 100) {
      throw new BadRequestException({
        errorCode: 'INVALID_LIMIT',
        message: 'limit must be greater than 0 and less than 100',
      });
    }
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await this.prismaService.$transaction([
      this.prismaService.user.findMany({
        take: limitNum,
        skip: skip,
        orderBy: {
          created_at: 'desc',
        },
      }),
      this.prismaService.user.count(),
    ]);
    return {
      items: users,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async findOne(id: string) {
    if (!id) throw new BadRequestException('userid is required');
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    if (!id) throw new BadRequestException('userid is required');
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
    return this.prismaService.user.update({
      where: { id },
      data: {
        ...updateUserDto,
      },
    });
  }

  async remove(id: string) {
    if (!id) throw new BadRequestException('userid is required');
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
    return this.prismaService.user.delete({ where: { id } });
  }
}
