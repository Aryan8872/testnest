import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { InvoiceModule } from './invoice/invoice.module.js';
import { CustomerModule } from './customer/customer.module.js';
import { UserModule } from './user/user.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { config } from 'dotenv';
import { ConfigModule } from '@nestjs/config';
import { ApiKeyMiddleware } from './common/middleware/api-key.middleware.js';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { IdempotencyService } from './common/idempotency/idempotency.service.js';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    InvoiceModule,
    CustomerModule,
    UserModule,
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService,IdempotencyService],
})
export class AppModule implements NestModule {
  //Class-based middleware needs Dependency Injection, so it's wired through configure() — not app.use():
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes();
    consumer.apply(RequestIdMiddleware).forRoutes("*")
  }
}
