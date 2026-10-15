/**
 * OpenTelemetry tracing initialization.
 *
 * Configures the OpenTelemetry NodeSDK with OTLP trace exporter and
 * auto-instrumentation for HTTP, Postgres (pg), and ioredis.
 *
 * Environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP collector endpoint (default: http://localhost:4318/v1/traces)
 *   OTEL_SERVICE_NAME — service name (default: trustflow-backend)
 *   OTEL_ENVIRONMENT — deployment environment (default: NODE_ENV value)
 *   OTEL_TRACES_SAMPLER — sampler type (default: parentbased_always_on)
 *
 * Initialization is idempotent and gracefully degrades when OpenTelemetry
 * packages are not installed.
 */

let isInitialized = false;
let sdkInstance: { shutdown: () => Promise<void> } | null = null;

export function initTracing(): { shutdown: () => Promise<void> } | null {
  if (isInitialized) return sdkInstance;
  isInitialized = true;

  try {
    // Dynamic imports so the app still boots when @opentelemetry/* is absent
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Resource } = require('@opentelemetry/resources');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { W3CTraceContextPropagator } = require('@opentelemetry/core');

    const serviceName = process.env.OTEL_SERVICE_NAME || 'trustflow-backend';
    const environment = process.env.OTEL_ENVIRONMENT || process.env.NODE_ENV || 'development';
    const otlpEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_RELEASE || '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    });

    const traceExporter = new OTLPTraceExporter({
      url: otlpEndpoint,
    });

    const sdk = new NodeSDK({
      resource,
      traceExporter,
      textMapPropagator: new W3CTraceContextPropagator(),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-http': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-pg': {
            enabled: true,
          },
          '@opentelemetry/instrumentation-ioredis': {
            enabled: true,
          },
        }),
      ],
    });

    sdk.start();
    sdkInstance = sdk;

    // Graceful shutdown
    process.on('SIGTERM', () => {
      sdk.shutdown().catch(() => process.exit(1));
    });
    process.on('SIGINT', () => {
      sdk.shutdown().catch(() => process.exit(1));
    });

    // eslint-disable-next-line no-console
    console.log(`[tracing] OpenTelemetry initialized: service=${serviceName}, endpoint=${otlpEndpoint}`);
    return sdk;
  } catch (error) {
    // Graceful degradation — tracing is optional
    // eslint-disable-next-line no-console
    console.warn(
      `[tracing] OpenTelemetry not available: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

/**
 * Creates a custom span for manual instrumentation.
 * Returns null when tracing is not initialized.
 */
export function createSpan(name: string, attributes?: Record<string, string>): unknown {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('trustflow-backend');
    return tracer.startSpan(name, { attributes });
  } catch {
    return null;
  }
}
