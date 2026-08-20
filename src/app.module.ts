import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { UserModule } from './user/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { AuthModule } from './auth/auth.module.js';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { PdfModule } from './common/pdf/pdf.module.js';
import { PdfService } from './common/pdf/pdf.service.js';
import { TenantModule } from './tenant/tenant.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    InvoiceModule,
    CustomerModule,
    UserModule,
    PdfModule,
    MailerModule.forRoot({
      transport: {
        host: 'smtp.ethereal.email',
        port: 587,
        auth: {
          user: 'Ruthie Satterfield',
          pass: 'TWauTRhG4RUvMzmQ1z',
        },
      },
      defaults: {
        from: 'noreply@cms.com',
      },
      template: {
        dir: process.cwd() + '/src/templates',
        adapter: new HandlebarsAdapter(),
        options: {
          strict: true,
        },
      },
    }),
    TenantModule,
  ],
  controllers: [AppController],
  providers: [AppService, PdfService],
})
export class AppModule implements NestModule {
  // Class-based middleware needs Dependency Injection, so it's wired through configure() — not app.use()
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes();
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
