import { Test, TestingModule } from '@nestjs/testing';
import { PaymentService } from './payment.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { jest } from '@jest/globals';
import { getToken } from '@willsoto/nestjs-prometheus';
import { getQueueToken } from '@nestjs/bullmq';
import {
  PAYMENT_SUCCESS_COUNTER,
  PAYMENT_REVENUE_COUNTER,
  PAYMENT_DURATION_HISTOGRAM,
} from './payment.metrics.js';

describe('PaymentService', () => {
  let service: PaymentService;

  const mockPrismaService = {
    invoice: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'KHALTI_BASE_URL') return 'https://a.khalti.com';
      return null;
    }),
    getOrThrow: jest.fn((key: string) => {
      switch (key) {
        case 'ESEWA_SECRET_KEY':
          return '8gBm/:&EnhH.1';
        case 'ESEWA_MERCHANT_CODE':
          return 'EPAYTEST';
        case 'ESEWA_BASE_URL':
          return 'https://rc-epay.esewa.com.np';
        case 'KHALTI_SECRET_KEY':
          return 'test_secret_key';
        case 'APP_URL':
          return 'http://localhost:3000';
        default:
          throw new Error(`Unexpected config key: ${key}`);
      }
    }),
  };

  const mockCacheManager = {
    get: jest.fn().mockResolvedValue(1),
    set: jest.fn().mockResolvedValue(undefined),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  const mockCounter = {
    inc: jest.fn(),
  };

  const mockHistogram = {
    startTimer: jest.fn().mockReturnValue(jest.fn()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken('payment-queue'), useValue: mockQueue },
        { provide: getToken(PAYMENT_SUCCESS_COUNTER), useValue: mockCounter },
        { provide: getToken(PAYMENT_REVENUE_COUNTER), useValue: mockCounter },
        { provide: getToken(PAYMENT_DURATION_HISTOGRAM), useValue: mockHistogram },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateEsewaPayment', () => {
    it('should generate signed eSewa checkout payload correctly', async () => {
      mockPrismaService.invoice.findFirst.mockResolvedValueOnce({
        id: 'inv-123',
        amount: 50000, // 500 NPR in paisa
        tenant_id: 'tenant-1',
        status: 'SENT',
      });

      const result = await service.initiateEsewaPayment('inv-123', 'tenant-1');

      expect(result).toHaveProperty('formAction');
      expect(result.fields).toHaveProperty('amount', 500);
      expect(result.fields).toHaveProperty('total_amount', 500);
      expect(result.fields).toHaveProperty('product_code', 'EPAYTEST');
      expect(result.fields).toHaveProperty('signature');
      expect(typeof result.fields.signature).toBe('string');
    });
  });
});
