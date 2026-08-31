import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const otelEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

const traceExporter = new OTLPTraceExporter({
  url: otelEndpoint,
});

export const otelSdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'cms-backend-api',
    [ATTR_SERVICE_VERSION]: '1.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  }),
  traceExporter,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // avoid noisy file system traces
      },
      '@opentelemetry/instrumentation-http': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-express': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
      },
      '@opentelemetry/instrumentation-pg': {
        enabled: true,
      },
    }),
  ],
});

// Initialize the OpenTelemetry SDK before the NestJS application starts
if (process.env.OTEL_ENABLED !== 'false') {
  try {
    otelSdk.start();
    console.log(`📡 OpenTelemetry initialized. Exporting traces to: ${otelEndpoint}`);
  } catch (error) {
    console.warn('⚠️ OpenTelemetry failed to start:', error);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  otelSdk
    .shutdown()
    .then(() => console.log('OpenTelemetry SDK terminated'))
    .catch((error) => console.error('Error terminating OpenTelemetry SDK', error));
});
