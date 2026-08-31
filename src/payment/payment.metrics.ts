import {
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

export const PAYMENT_SUCCESS_COUNTER = 'cms_payments_total';
export const PAYMENT_REVENUE_COUNTER = 'cms_payment_revenue_npr_total';
export const PAYMENT_DURATION_HISTOGRAM = 'cms_payment_processing_duration_seconds';

export const paymentSuccessCounterProvider = makeCounterProvider({
  name: PAYMENT_SUCCESS_COUNTER,
  help: 'Total count of successful payments processed by gateway',
  labelNames: ['gateway', 'status'],
});

export const paymentRevenueCounterProvider = makeCounterProvider({
  name: PAYMENT_REVENUE_COUNTER,
  help: 'Total gross revenue collected in NPR by gateway',
  labelNames: ['gateway'],
});

export const paymentDurationHistogramProvider = makeHistogramProvider({
  name: PAYMENT_DURATION_HISTOGRAM,
  help: 'Latency distribution of payment gateway verification requests',
  labelNames: ['gateway'],
  buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
