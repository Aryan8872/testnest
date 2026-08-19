// src/common/interceptors/idempotency.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  BadRequestException,
} from '@nestjs/common';
import { Observable, tap, EMPTY } from 'rxjs';
import { IdempotencyService } from '../../idempotency/idempotency.service.js';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idem: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Only protect POST/PUT (or whichever methods you want)
    if (!['POST', 'PUT'].includes(req.method)) {
      return next.handle();
    }

    const key = req.header('Idempotency-Key') ?? req.header('idempotency-key');
    if (!key) {
      // You can either require it (throw) or simply skip idempotency
      // throw new BadRequestException('Idempotency-Key required');
      return next.handle();
    }

    // 1) If final response cached, replay it and short-circuit
    const cached = await this.idem.get(key);
    if (cached) {
      if (cached.headers) {
        Object.entries(cached.headers).forEach(([k, v]) => res.setHeader(k, v));
      }
      res.status(cached.status).json(cached.body);
      return EMPTY; // short-circuit the pipeline
    }

    // 2) Try to acquire lock; if another worker is processing, return 409 or 202
    const locked = await this.idem.acquireLock(key, 30);
    if (!locked) {
      // Option A: wait/poll (complex)
      // Option B: respond 409 or 202; here we choose a 409-ish response for simplicity
      throw new BadRequestException({ errorCode: 'IDEMPOTENCY_IN_PROGRESS', message: 'Request already being processed' });
    }

    // 3) No cached and lock acquired → process request, and store final result
    return next.handle().pipe(
      tap({
        next: async (body) => {
          try {
            const status = res.statusCode || 200;
            // Capture important headers (Location etc.)
            const headersToStore: Record<string, string> = {};
            // e.g., store Location header if set
            const loc = res.getHeader('Location');
            if (loc) headersToStore['location'] = String(loc);

            await this.idem.set(key, { status, body, headers: headersToStore }, 60 * 60);
          } finally {
            await this.idem.releaseLock(key);
          }
        },
        error: async () => {
          // ensure lock released on error
          await this.idem.releaseLock(key);
        },
      }),
    );
  }
}