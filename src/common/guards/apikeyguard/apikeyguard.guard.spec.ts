import { Test, TestingModule } from '@nestjs/testing';
import { ApikeyguardGuard } from './apikeyguard.guard.js';
import { ApiKeyService } from '../../../api-key/api-key.service.js';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { jest } from '@jest/globals';

describe('ApikeyguardGuard', () => {
  let guard: ApikeyguardGuard;
  let apiKeyService: {
    validateApiKey: jest.Mock;
  };

  beforeEach(async () => {
    apiKeyService = {
      validateApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApikeyguardGuard,
        { provide: ApiKeyService, useValue: apiKeyService },
      ],
    }).compile();

    guard = module.get<ApikeyguardGuard>(ApikeyguardGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow access and attach tenant context when key is valid', async () => {
    const mockContext = {
      id: 'key-1',
      tenantId: 'tenant-1',
      name: 'Test Key',
    };
    apiKeyService.validateApiKey.mockResolvedValue(mockContext);

    const request: any = {
      headers: { 'x-api-key': 'cms_live_validkey123' },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.apiKey).toEqual(mockContext);
    expect(request.tenantId).toBe('tenant-1');
  });

  it('should throw UnauthorizedException if header is missing', async () => {
    const request: any = { headers: {} };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
