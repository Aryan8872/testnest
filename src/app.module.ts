import { Redis, type RedisOptions } from 'ioredis';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { UserModule } from './user/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { AuthModule } from './auth/auth.module.js';
import { BullModule } from '@nestjs/bullmq';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { PdfModule } from './common/pdf/pdf.module.js';
import { PdfService } from './common/pdf/pdf.service.js';
import { TenantModule } from './tenant/tenant.module.js';
import { LoggerModule } from 'nestjs-pino';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { getRedisConnection } from './common/redis/redis.connection.js';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { HealthModule } from './health/health.module.js';
import { ApiKeyModule } from './api-key/api-key.module.js';
import { validateEnv } from './common/config/env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        throttlers: [
          { name: 'short', ttl: 1000, limit: 10 },
          { name: 'medium', ttl: 60000, limit: 100 },
        ],
        storage: new ThrottlerStorageRedisService(
          new Redis(getRedisConnection() as RedisOptions),
        ),
      }),
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        stores: [
          createKeyv(
            process.env.REDIS_URL ||
              `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`,
          ),
        ],
        ttl: 60 * 1000, // 1minute default
      }),
    }),
    PrismaModule,
    LoggerModule.forRoot({
      pinoHttp: {
        // Automatically attach our requestId to every log
        customProps: (req: any, res: any) => ({
          requestId: req['requestId'],
        }),
        // Use pino-pretty to make JSON readable on your local machine
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async () => ({
        connection: getRedisConnection(),
      }),
    }),
    AuthModule,
    InvoiceModule,
    CustomerModule,
    UserModule,
    PdfModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const port = config.get<number>('SMTP_PORT', 587);
        const isSecure =
          config.get<string>('SMTP_SECURE') === 'true' || port === 465;

        return {
          transport: {
            host: config.get<string>('SMTP_HOST', 'smtp.ethereal.email'),
            port: port,
            secure: isSecure,
            auth: {
              user: config.get<string>(
                'SMTP_USER',
                'hakdgegahpjif4g6@ethereal.email',
              ),
              pass: config.get<string>('SMTP_PASS', 'YzjWhASGh8gdUjH7Vr'),
            },
          },
          defaults: {
            from: config.get<string>('SMTP_FROM', 'noreply@cms.com'),
          },
        };
      },
    }),
    TenantModule,
    ApiKeyModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PdfService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  // Class-based middleware needs Dependency Injection, so it's wired through configure() — not app.use()
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes();
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
