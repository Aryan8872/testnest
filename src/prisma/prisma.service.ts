import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(config: ConfigService) {
    const connectionString = config.get<string>('DATABASE_URL');
    if (!connectionString) throw new Error('database url is not configured');
    const adapter = new PrismaPg({
      connectionString,
    });
    super({ adapter });
  }
  onModuleDestroy() {
    throw new Error('Method not implemented.');
  }
  onModuleInit() {
    throw new Error('Method not implemented.');
  }
}
