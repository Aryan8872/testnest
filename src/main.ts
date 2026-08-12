import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { TransformInterceptor } from './utils/transform.interceptor.js';
import { BadRequestException, ValidationPipe, VersioningType } from '@nestjs/common';
import { PrismaExceptionFilter } from './common/exceptions/prisma-exception-filter.js';
import { HttpExceptionFilter } from './common/exceptions/http-exception-filter.js';
import { LoggingInterceptor } from './interceptor/logging/logging.interceptor.js';
import { ResponseInterceptor } from './interceptor/response/response.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableVersioning({
    type:VersioningType.URI
  })
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
  app.useGlobalFilters(new PrismaExceptionFilter(), new HttpExceptionFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
