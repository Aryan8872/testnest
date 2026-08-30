import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceService } from './invoice.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IdempotencyService } from '../common/idempotency/idempotency.service.js';
import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { jest } from '@jest/globals';

describe('InvoiceService', () => {
  let service: InvoiceService;

  const mockPrismaService = {
    invoice: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockIdempotencyService = {
    checkAndLock: jest.fn(),
    saveResponse: jest.fn(),
    releaseLock: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: IdempotencyService, useValue: mockIdempotencyService },
        { provide: getQueueToken('invoice-queue'), useValue: mockQueue },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<InvoiceService>(InvoiceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
