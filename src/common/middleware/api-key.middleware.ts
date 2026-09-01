import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { ApiKeyService } from '../../api-key/api-key.service.js';

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  /**
   * Enterprise Context Extractor Middleware:
   * 1. Checks if an X-API-KEY / x-api-key header is present on the incoming request.
   * 2. If present: Validates the key via Redis/PostgreSQL in constant-time and attaches
   *    validated context (tenantId, apiKey entity) to `req['apiKey']` & `req['tenantId']`.
   * 3. If invalid/expired: Rejects early with a standardized UnauthorizedException.
   * 4. If absent: Gracefully passes through to let downstream guards (JwtAuthGuard / Public / ApikeyguardGuard)
   *    decide authorization based on the specific route metadata.
   */
  async use(req: Request, res: Response, next: NextFunction) {
    const rawApiKey = (req.headers['x-api-key'] || req.headers['X-API-KEY']) as
      | string
      | undefined;

    // Pass through if request is using JWT or hitting a public endpoint
    if (!rawApiKey) {
      return next();
    }

    try {
      const validatedContext =
        await this.apiKeyService.validateApiKey(rawApiKey);

      // Attach context to request for downstream controllers, guards, and decorators
      req['apiKey'] = validatedContext;
      req['tenantId'] = validatedContext.tenantId;

      next();
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        errorCode: 'INVALID_API_KEY',
        message: 'Failed to authenticate provided API key',
      });
    }
  }
}
