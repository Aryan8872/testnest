import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    switch (exception.code) {
      case 'P2025':
        throw new NotFoundException('Record not found');

      case 'P2002':
        throw new ConflictException('Unique constraint failed');

      default:
        throw new InternalServerErrorException('Database error');
    }
  }
}
