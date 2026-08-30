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
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
        const formatErrors = (errs: any[]): any[] => {
          const result: any[] = [];
          for (const err of errs) {
            if (err.constraints) {
              result.push({
                field: err.property,
                errors: Object.values(err.constraints),
              });
            }
            if (err.children && err.children.length > 0) {
              result.push(...formatErrors(err.children));
            }
          }
          return result;
        };

        return new BadRequestException({
          errorCode: 'VALIDATION_ERROR',
          message: 'validation failed',
          errors: formatErrors(errors),
        });
      },
    }),
  );
  app.useGlobalInterceptors(
    // new LoggingInterceptor(),
    new ResponseInterceptor(),
    // IdempotencyInterceptor removed — idempotency is handled at service level
    // in InvoiceService.createInvoice() via claimKeyIfNotExists()
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger OpenAPI 3.0 Documentation Setup
  const config = new DocumentBuilder()
    .setTitle('Enterprise SaaS CMS API')
    .setDescription(
      'Production-grade multi-tenant CMS API with Idempotency, BullMQ Background Jobs, Tiered Throttling, and Redis Caching.',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT Access Token',
        in: 'header',
      },
      'JWT-auth', // This name will be referenced in @ApiBearerAuth() decorators
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-KEY',
        in: 'header',
        description: 'Tenant API Key for machine-to-machine requests',
      },
      'api-key',
    )
    .addTag('Auth', 'Authentication, Registration and User Profile')
    .addTag('Invoices', 'Invoice Creation and Background PDF Generation')
    .addTag('Customers', 'Tenant Customer Management')
    .addTag('Tenants', 'Multi-tenant Organization Management')
    .addTag('Users', 'User Accounts Management')
    .addTag('Health', 'Liveness and Readiness Probes')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
