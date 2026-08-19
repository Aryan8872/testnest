// src/common/idempotency/idempotency.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

type StoredResponse = {
  status: number;
  body: any;
  headers?: Record<string, string>;
};

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Attempt to reserve the key. If key exists -> return it.
   * If not exists -> create record with status 'processing'.
   * This must be run *outside* of invoice create transaction OR inside if you will create both in same DB tx.
   */
  async claimKeyIfNotExists(
    key: string,
    requestHash: string,
    ownerType?: string,
    ownerId?: string,
  ) {
    try {
      const rec = await this.prisma.idempotencykey.create({
        data: {
          key,
          requestHash,
          ownerType: ownerType ?? null,
          ownerId: ownerId ?? null,
          status: 'PROCESSING',
        },
      });
      return { created: true, record: rec };
    } catch (e: any) {
      // unique constraint violation -> key exists
      const existing = await this.prisma.idempotencykey.findUnique({
        where: { key },
      });
      return { created: false, record: existing };
    }
  }

  /**
   * Update the idempotency record with final response inside the same DB tx ideally.
   */
  async markDone(key: string, response: StoredResponse) {
    return this.prisma.idempotencykey.update({
      where: { key },
      data: {
        status: 'DONE',
        response,
      },
    });
  }

  /**
   * When done and the stored response should be returned to the caller.
   */
  async getCompleted(key: string) {
    const rec = await this.prisma.idempotencykey.findUnique({ where: { key } });
    return rec?.status === 'DONE' ? (rec.response as StoredResponse) : null;
  }

  /**
   * Alias for getCompleted to support interceptors.
   */
  async get(key: string) {
    return this.getCompleted(key);
  }

  /**
   * Acquire lock for a key. Returns true if acquired.
   */
  async acquireLock(key: string, ttlSeconds = 30) {
    const claim = await this.claimKeyIfNotExists(key, `lock-${Date.now()}`);
    return claim.created;
  }

  /**
   * Store final cached response.
   */
  async set(key: string, response: StoredResponse, ttlSeconds = 3600) {
    return this.markDone(key, response);
  }

  /**
   * Release lock if processing failed.
   */
  async releaseLock(key: string) {
    try {
      const rec = await this.prisma.idempotencykey.findUnique({
        where: { key },
      });
      if (rec && rec.status === 'PROCESSING') {
        await this.prisma.idempotencykey.delete({ where: { key } });
      }
    } catch (e) {
      // Ignore cleanup error
    }
  }
}
