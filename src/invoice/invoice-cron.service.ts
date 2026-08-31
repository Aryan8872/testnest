import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class InvoiceCronService {
  private readonly logger = new Logger(InvoiceCronService.name);

  constructor(
    private readonly prismaService: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Runs every day at midnight UTC.
   * Marks all SENT/PARTIALLY_PAID invoices whose due_date has passed as OVERDUE.
   * Then bumps Redis cache versions for all affected tenants so stale data
   * is never served to clients.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueInvoices() {
    this.logger.log({
      event: 'cron.overdue_sweep.start',
      message: 'Running daily overdue invoice sweep',
    });

    // Find affected tenant IDs before bulk-updating so we can invalidate their caches
    const affectedInvoices = await this.prismaService.invoice.findMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        due_date: { lt: new Date() }, // ← correct field name from Prisma schema
      },
      select: { tenant_id: true },
      distinct: ['tenant_id'],
    });

    // Bulk update all overdue invoices in one query
    const result = await this.prismaService.invoice.updateMany({
      where: {
        status: { in: ['SENT', 'PARTIALLY_PAID'] },
        due_date: { lt: new Date() },
      },
      data: { status: 'OVERDUE' },
    });

    // Bump Redis cache version per tenant so invoice list caches are invalidated
    if (result.count > 0) {
      await Promise.all(
        affectedInvoices.map(({ tenant_id }) =>
          this.cacheManager.del(`invoice:version:${tenant_id}`),
        ),
      );
    }

    this.logger.log({
      event: 'cron.overdue_sweep.complete',
      message: `Marked ${result.count} invoices as OVERDUE`,
      affectedTenants: affectedInvoices.length,
    });
  }
}
