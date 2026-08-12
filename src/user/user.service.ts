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

  findAll() {
    return this.prismaService.user.findMany();
  }

  findOne(id: string) {
    if (!id) throw new BadRequestException('userid is required');
    const user = this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    if (!id) throw new BadRequestException('userid is required');
    const user = await this.prismaService.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`user with id: ${id} not found`);
    return  this.prismaService.user.update({
      where: { id },
      data: {
        ...updateUserDto,
      },
    });
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
}
