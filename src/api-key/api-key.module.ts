import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service.js';
import { ApiKeyController } from './api-key.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [ApiKeyController],
  providers: [ApiKeyService],
  exports: [ApiKeyService],
})
export class ApiKeyModule {}
