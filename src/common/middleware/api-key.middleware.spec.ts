import { ApiKeyMiddleware } from './api-key.middleware.js';
import { ApiKeyService } from '../../api-key/api-key.service.js';
import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';

describe('ApiKeyMiddleware', () => {
  let middleware: ApiKeyMiddleware;
  let mockApiKeyService: Partial<ApiKeyService>;

  beforeEach(() => {
    mockApiKeyService = {
      validateApiKey: jest.fn() as any,
    };
    middleware = new ApiKeyMiddleware(mockApiKeyService as ApiKeyService);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  it('should pass through if no x-api-key header is present', async () => {
    const req: any = { headers: {} };
    const res: any = {};
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockApiKeyService.validateApiKey).not.toHaveBeenCalled();
    expect(req.apiKey).toBeUndefined();
  });

  it('should validate and attach context if x-api-key header is present', async () => {
    const mockContext = {
      id: 'key-123',
      tenantId: 'tenant-456',
      name: 'Production Key',
    };
    (mockApiKeyService.validateApiKey as any).mockResolvedValueOnce(mockContext);

    const req: any = { headers: { 'x-api-key': 'cms_live_valid_key' } };
    const res: any = {};
    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(mockApiKeyService.validateApiKey).toHaveBeenCalledWith('cms_live_valid_key');
    expect(req.apiKey).toEqual(mockContext);
    expect(req.tenantId).toBe('tenant-456');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should throw UnauthorizedException if API key is invalid', async () => {
    (mockApiKeyService.validateApiKey as any).mockRejectedValueOnce(
      new UnauthorizedException('Invalid API Key'),
    );

    const req: any = { headers: { 'x-api-key': 'cms_live_invalid_key' } };
    const res: any = {};
    const next = jest.fn();

    await expect(middleware.use(req, res, next)).rejects.toThrow(UnauthorizedException);
    expect(next).not.toHaveBeenCalled();
  });
});
