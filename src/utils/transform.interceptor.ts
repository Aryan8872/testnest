import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { Reflector } from '@nestjs/core';
import { RESPONSE_MESSAGE_KEY } from '../decorators/response-message.decorator';
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor {
  //Reflector reads the metadata that SetMetadata attached —
  // the standard way custom decorators communicate with interceptors/guards in Nest.
  constructor(private reflector: Reflector) {}
  
  //it can run logic before the controller executes and after it returns,
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const message = this.reflector.get<string>(
      RESPONSE_MESSAGE_KEY,
      context.getHandler(),
    );
    const statusCode = response.statusCode;

    //next.handle() fires the controller and gets its result; 
    // .pipe(map(...)) transforms that result before it goes out.
    return next.handle().pipe(
      map((data: T) => ({
        statusCode,
        message,
        data,
      })),
    );
  }
}
