import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
    private readonly prismaservice: PrismaService,
  ) {}

  @Public()
  @Get('live')
  @HealthCheck()
  checkLive() {
    return this.health.check([async () => ({ app: { status: 'up' } })]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  checkReady() {
    return this.health.check([
      // 1. Check PostgreSQL Database connection via Prisma
      () => this.prismaHealth.pingCheck('database', this.prismaservice),

      // 2. Check Memory Heap limit (fail if heap exceeds 300MB)
      () => this.memory.checkHeap('memory_heap', 300 * 1024 * 1024),

      // 3. Check Process RSS limit (fail if total memory exceeds 500MB)
      () => this.memory.checkRSS('memory_rss', 500 * 1024 * 1024),
    ]);
  }
}
