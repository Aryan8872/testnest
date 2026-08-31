import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createHash, randomBytes } from 'crypto';
import {
  ApiKeyCreatedResponseDto,
  CreateApiKeyDto,
} from './dto/create-api-key.dto.js';
import { ApiKey, APIKEYSTATUS } from '@prisma/client';

export interface ValidatedApiKeyContext {
  id: string;
  tenantId: string;
  name: string;
}

@Injectable()
export class ApiKeyService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  /**
   * Cryptographically hash raw API key using SHA-256 for secure constant-time matching
   */
  hashKey(rawKey: string): string {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  /**
   * Generate a secure API Key:
   * Format: cms_live_<32 hex chars>
   * Prefix: cms_live_<first 6 hex chars>
   */
  private generateRawKey(): { rawKey: string; prefix: string; keyHash: string } {
    const entropy = randomBytes(24).toString('hex'); // 48 chars
    const rawKey = `cms_live_${entropy}`;
    const prefix = `cms_live_${entropy.slice(0, 8)}`;
    const keyHash = this.hashKey(rawKey);
    return { rawKey, prefix, keyHash };
  }

  /**
   * Create a new API key for a tenant
   */
  async createApiKey(
    tenantId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    const { rawKey, prefix, keyHash } = this.generateRawKey();

    const apiKeyRecord = await this.prisma.apiKey.create({
      data: {
        name: dto.name,
        prefix,
        keyHash,
        tenant_id: tenantId,
        expires_at: dto.expiresAt ? new Date(dto.expiresAt) : null,
        status: APIKEYSTATUS.ACTIVE,
      },
    });

    // Seed Redis cache for fast validation
    const cacheKey = `apikey:hash:${keyHash}`;
    const cachedContext: ValidatedApiKeyContext = {
      id: apiKeyRecord.id,
      tenantId: apiKeyRecord.tenant_id,
      name: apiKeyRecord.name,
    };
    await this.cacheManager.set(cacheKey, cachedContext, 60 * 60 * 24 * 1000); // 24h

    return {
      id: apiKeyRecord.id,
      name: apiKeyRecord.name,
      prefix: apiKeyRecord.prefix,
      apiKey: rawKey, // Displayed ONLY ONCE
      status: apiKeyRecord.status,
      expiresAt: apiKeyRecord.expires_at,
      createdAt: apiKeyRecord.created_at,
    };
  }

  /**
   * List all API keys for a tenant (returns metadata only, raw secret is never stored)
   */
  async listApiKeys(tenantId: string): Promise<Omit<ApiKey, 'keyHash'>[]> {
    const keys = await this.prisma.apiKey.findMany({
      where: { tenant_id: tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        tenant_id: true,
        status: true,
        expires_at: true,
        last_used_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return keys;
  }

  /**
   * Revoke an API Key immediately and evict from Redis cache
   */
  async revokeApiKey(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!key) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    await this.prisma.apiKey.update({
      where: { id },
      data: { status: APIKEYSTATUS.REVOKED },
    });

    // Invalidate Redis cache
    await this.cacheManager.del(`apikey:hash:${key.keyHash}`);

    return {
      success: true,
      message: `API Key '${key.name}' (${key.prefix}...) has been revoked.`,
    };
  }

  /**
   * Roll an API key: Revokes current key and issues a new replacement atomically
   */
  async rollApiKey(
    tenantId: string,
    id: string,
  ): Promise<ApiKeyCreatedResponseDto> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!existing) {
      throw new NotFoundException(`API key with ID ${id} not found`);
    }

    const { rawKey, prefix, keyHash } = this.generateRawKey();

    const [_, newKey] = await this.prisma.$transaction([
      // 1. Revoke existing key
      this.prisma.apiKey.update({
        where: { id },
        data: { status: APIKEYSTATUS.REVOKED },
      }),
      // 2. Create new rolled key
      this.prisma.apiKey.create({
        data: {
          name: `${existing.name} (Rolled)`,
          prefix,
          keyHash,
          tenant_id: tenantId,
          expires_at: existing.expires_at,
          status: APIKEYSTATUS.ACTIVE,
        },
      }),
    ]);

    // Invalidate old cache & set new cache
    await this.cacheManager.del(`apikey:hash:${existing.keyHash}`);
    await this.cacheManager.set(
      `apikey:hash:${keyHash}`,
      {
        id: newKey.id,
        tenantId: newKey.tenant_id,
        name: newKey.name,
      },
      60 * 60 * 24 * 1000,
    );

    return {
      id: newKey.id,
      name: newKey.name,
      prefix: newKey.prefix,
      apiKey: rawKey,
      status: newKey.status,
      expiresAt: newKey.expires_at,
      createdAt: newKey.created_at,
    };
  }

  /**
   * Validate raw API key header (used by ApikeyguardGuard & ApiKeyMiddleware)
   */
  async validateApiKey(rawKey: string): Promise<ValidatedApiKeyContext> {
    if (!rawKey || !rawKey.startsWith('cms_live_')) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_API_KEY',
        message: 'Invalid or malformed API key provided',
      });
    }

    const keyHash = this.hashKey(rawKey);
    const cacheKey = `apikey:hash:${keyHash}`;

    // 1. Check Redis Cache for <1ms authentication
    const cached = await this.cacheManager.get<ValidatedApiKeyContext>(cacheKey);
    if (cached) {
      // Asynchronously record last_used_at without blocking request
      this.prisma.apiKey
        .update({
          where: { id: cached.id },
          data: { last_used_at: new Date() },
        })
        .catch(() => {});

      return cached;
    }

    // 2. Cache miss -> Query DB
    const apiKey = await this.prisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    });

    if (!apiKey || apiKey.status !== APIKEYSTATUS.ACTIVE) {
      throw new UnauthorizedException({
        errorCode: 'INVALID_API_KEY',
        message: 'API key is inactive or does not exist',
      });
    }

    if (apiKey.expires_at && apiKey.expires_at < new Date()) {
      // Mark expired in DB
      await this.prisma.apiKey.update({
        where: { id: apiKey.id },
        data: { status: APIKEYSTATUS.EXPIRED },
      });
      throw new UnauthorizedException({
        errorCode: 'API_KEY_EXPIRED',
        message: 'API key has expired',
      });
    }

    if (apiKey.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException({
        errorCode: 'TENANT_INACTIVE',
        message: 'Tenant organization is suspended or inactive',
      });
    }

    const validatedContext: ValidatedApiKeyContext = {
      id: apiKey.id,
      tenantId: apiKey.tenant_id,
      name: apiKey.name,
    };

    // Cache valid result in Redis
    await this.cacheManager.set(cacheKey, validatedContext, 60 * 60 * 24 * 1000);

    // Update last used timestamp
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { last_used_at: new Date() },
      })
      .catch(() => {});

    return validatedContext;
  }
}
