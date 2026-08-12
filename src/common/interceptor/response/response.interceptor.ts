import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { RequestWithId } from '../../middleware/request-id.middleware.js';
import { Request } from 'express';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<RequestWithId & Request>();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        requestId: req.requestId,
        data,
      })),
    );
  }
}
