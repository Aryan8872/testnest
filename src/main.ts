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
import { LoggingInterceptor } from './common/interceptor/logging/logging.interceptor.js';
import { ResponseInterceptor } from './common/interceptor/response/response.interceptor.js';
import { IdempotencyInterceptor } from './common/interceptor/idempotency/idempotency.interceptor.js';
import { IdempotencyService } from './common/idempotency/idempotency.service.js';

async function bootstrap() {
  Sentry.init({
    dsn: 'https://3074667d9b8737b7fb9139cc97b51208@o4511942670548992.ingest.de.sentry.io/4511944176631888',
    integrations: [nodeProfilingIntegration()],
    // Send structured logs to Sentry
    enableLogs: true,
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Set sampling rate for profiling - this is evaluated only once per SDK.init call
    profileSessionSampleRate: 1.0,
    // Trace lifecycle automatically enables profiling during active traces
    profileLifecycle: 'trace',
    dataCollection: {
      // To disable sending user data and HTTP bodies, uncomment the lines below. For more info visit:
      // https://docs.sentry.io/platforms/javascript/guides/node/configuration/options/#dataCollection
      // userInfo: false,
      // httpBodies: [],
    },
  });
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
    new IdempotencyInterceptor(app.get(IdempotencyService)),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
