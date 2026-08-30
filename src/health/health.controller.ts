import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { Public } from '../decorators/public.decorator.js';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

// Health probes must NEVER be throttled.
// Load balancers, Railway, Kubernetes all poll these endpoints every 5-10s.
// A 429 response would cause the orchestrator to mark the instance as unhealthy and restart it.
// NOTE: @nestjs/throttler v6 requires explicitly naming each throttler to skip.
@ApiTags('Health')
@SkipThrottle({ short: true, medium: true })
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
  @ApiOperation({ summary: 'Liveness probe for orchestrators/load balancers' })
  @ApiResponse({ status: 200, description: 'Application is running' })
  checkLive() {
    return this.health.check([async () => ({ app: { status: 'up' } })]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe checking Database & Memory Heap/RSS thresholds' })
  @ApiResponse({ status: 200, description: 'Application is ready to accept incoming traffic' })
  @ApiResponse({ status: 503, description: 'Service unhealthy (DB down or memory threshold breached)' })
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
