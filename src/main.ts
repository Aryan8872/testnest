import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';

import { GlobalExceptionFilter } from './common/filters/global-exception-filter.js';
import { LoggingInterceptor } from './common/interceptor/logging/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      stopAtFirstError: false, // better UX for frontend
      exceptionFactory: (errors) => {
        return new BadRequestException({
          errorCode: 'VALIDATION_ERROR',
          message: 'validation failed',
          errors: errors.map((err) => ({
            field: err.property,
            errors: Object.values(err.constraints || {}),
          })),
        });
      },
    }),
  );
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new ResponseInterceptor(),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
