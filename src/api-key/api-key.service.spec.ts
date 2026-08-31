import { Test, TestingModule } from '@nestjs/testing';
import { ApiKeyService } from './api-key.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { APIKEYSTATUS } from '@prisma/client';
import { jest } from '@jest/globals';

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let prisma: {
    apiKey: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let cacheManager: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      apiKey: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    cacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: prisma },
        { provide: CACHE_MANAGER, useValue: cacheManager },
      ],
    }).compile();

    service = module.get<ApiKeyService>(ApiKeyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createApiKey', () => {
    it('should generate a secret key with cms_live_ prefix and return it once', async () => {
      prisma.apiKey.create.mockImplementation((args: any) =>
        Promise.resolve({
          id: 'key-1',
          name: args.data.name,
          prefix: args.data.prefix,
          keyHash: args.data.keyHash,
          tenant_id: args.data.tenant_id,
          status: args.data.status,
          expires_at: args.data.expires_at,
          created_at: new Date(),
        }),
      );
      cacheManager.set.mockResolvedValue(undefined);

      const result = await service.createApiKey('tenant-1', {
        name: 'Stripe Webhook',
      });

      expect(result.id).toBe('key-1');
      expect(result.apiKey).toMatch(/^cms_live_[a-f0-9]{48}$/);
      expect(result.prefix).toBe(result.apiKey.slice(0, 17));
      expect(cacheManager.set).toHaveBeenCalled();
    });
  });

  describe('validateApiKey', () => {
    it('should authenticate from Redis cache when hit', async () => {
      const cached = {
        id: 'key-1',
        tenantId: 'tenant-1',
        name: 'Stripe Webhook',
      };
      cacheManager.get.mockResolvedValue(cached);
      prisma.apiKey.update.mockResolvedValue({});

      const rawKey = 'cms_live_0123456789abcdef0123456789abcdef0123456789abcdef';
      const result = await service.validateApiKey(rawKey);

      expect(result).toEqual(cached);
      expect(cacheManager.get).toHaveBeenCalled();
      expect(prisma.apiKey.findUnique).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on malformed prefix', async () => {
      await expect(service.validateApiKey('invalid_key_prefix')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when key not found in DB', async () => {
      cacheManager.get.mockResolvedValue(null);
      prisma.apiKey.findUnique.mockResolvedValue(null);

      const rawKey = 'cms_live_0123456789abcdef0123456789abcdef0123456789abcdef';
      await expect(service.validateApiKey(rawKey)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('revokeApiKey', () => {
    it('should mark key as REVOKED and evict Redis cache', async () => {
      const mockKey = {
        id: 'key-1',
        name: 'Test Key',
        prefix: 'cms_live_abc',
        keyHash: 'hash123',
        tenant_id: 'tenant-1',
      };
      prisma.apiKey.findFirst.mockResolvedValue(mockKey);
      prisma.apiKey.update.mockResolvedValue({ ...mockKey, status: APIKEYSTATUS.REVOKED });
      cacheManager.del.mockResolvedValue(undefined);

      const result = await service.revokeApiKey('tenant-1', 'key-1');

      expect(result.success).toBe(true);
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: 'key-1' },
        data: { status: APIKEYSTATUS.REVOKED },
      });
      expect(cacheManager.del).toHaveBeenCalledWith('apikey:hash:hash123');
    });

    it('should throw NotFoundException if key not found for tenant', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revokeApiKey('tenant-1', 'unknown')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
