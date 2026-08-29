import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';

import { GlobalExceptionFilter } from './common/filters/global-exception-filter.js';
// import { LoggingInterceptor } from './common/interceptor/logging/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor.js';
import { IdempotencyInterceptor } from './common/interceptor/idempotency/idempotency.interceptor.js';
import { IdempotencyService } from './common/idempotency/idempotency.service.js';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';

async function bootstrap() {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      integrations: [nodeProfilingIntegration()],
      enableLogs: true,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      profileSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
      profileLifecycle: 'trace',
    });
  }
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.use(helmet());
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-API-KEY',
      'Idempotency-Key',
      'X-Request-ID',
    ],
  });
  // Override the default logger with Pino
  app.useLogger(app.get(Logger));
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
    // new LoggingInterceptor(),
    new ResponseInterceptor(),
    new IdempotencyInterceptor(app.get(IdempotencyService)),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
