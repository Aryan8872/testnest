import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { logger } from '../../../logger/logger.service.js';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        logger.info({
          requestId: req.requestId,
          method: req.method,
          url: req.url,
          duration: `${Date.now() - start}ms`,
        });
      }),
    );
  }
}
