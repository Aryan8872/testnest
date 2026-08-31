import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service.js';
import { PaymentController } from './payment.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { BullModule } from '@nestjs/bullmq';
import { PaymentProcessor } from './payment.processor.js';
import { PdfModule } from '../common/pdf/pdf.module.js';
import {
  paymentSuccessCounterProvider,
  paymentRevenueCounterProvider,
  paymentDurationHistogramProvider,
} from './payment.metrics.js';

@Module({
  imports: [
    PrismaModule,
    PdfModule,
    BullModule.registerQueue({
      name: 'payment-queue',
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 3000, // 3s, 6s, 12s, 24s...
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep in Dead-Letter Queue for audit inspection
      },
    }),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    PaymentProcessor,
    paymentSuccessCounterProvider,
    paymentRevenueCounterProvider,
    paymentDurationHistogramProvider,
  ],
  exports: [PaymentService],
})
export class PaymentModule {}
