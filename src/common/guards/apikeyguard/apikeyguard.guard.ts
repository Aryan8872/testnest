import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeyService } from '../../../api-key/api-key.service.js';

@Injectable()
export class ApikeyguardGuard implements CanActivate {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 1. If ApiKeyMiddleware already validated and attached the context, reuse it (0ms redundant check)
    if (request.apiKey && request.tenantId) {
      return true;
    }

    // 2. Otherwise extract and strictly validate
    const apiKeyHeader =
      request.headers['x-api-key'] || request.headers['X-API-KEY'];

    if (!apiKeyHeader || typeof apiKeyHeader !== 'string') {
      throw new UnauthorizedException({
        errorCode: 'MISSING_API_KEY',
        message: 'x-api-key header is required for this endpoint',
      });
    }

    const validatedContext =
      await this.apiKeyService.validateApiKey(apiKeyHeader);

    // Attach validated tenant context to request
    request.apiKey = validatedContext;
    request.tenantId = validatedContext.tenantId;

    return true;
  }
}
