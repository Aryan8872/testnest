import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InvoiceModule } from './invoice/invoice.module';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import { CustomerModule } from './customer/customer.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [InvoiceModule, CustomerModule, UserModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  //Class-based middleware needs Dependency Injection, so it's wired through configure() — not app.use():
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(ApiKeyMiddleware).forRoutes()
  }
}
