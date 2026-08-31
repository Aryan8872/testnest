import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestWithId } from '../../middleware/request-id.middleware.js';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<RequestWithId & Request>();
    const start = performance.now();
    const { method, originalUrl } = req;
    const requestId = req.requestId;
    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const durationMs = Math.round(performance.now() - start);
          this.logger.log(
            JSON.stringify({
              event: 'http.request.success',
              requestId,
              method,
              path: originalUrl,
              statusCode: response.statusCode,
              durationMs,
            }),
          );
        },
        error: (error: unknown) => {
          const response = context.switchToHttp().getResponse();
          const durationMs = Math.round(performance.now() - start);
          this.logger.error(
            JSON.stringify({
              event: 'http.request.failed',
              requestId,
              method,
              path: originalUrl,
              statusCode: response.statusCode,
              durationMs,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        },
      }),
    );
  }
}
