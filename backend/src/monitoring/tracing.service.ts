import { Injectable } from '@nestjs/common';
import { SanitizedLogger } from '../common/logging/sanitized-logger';

/**
 * Thin wrapper around the OpenTelemetry tracer API for use inside NestJS services.
 *
 * When OTel is not installed or OTEL_ENABLED is false the methods are no-ops,
 * so callers never need to guard against a missing SDK.
 *
 * Usage:
 *   constructor(private readonly tracing: TracingService) {}
 *
 *   async doWork() {
 *     return this.tracing.withSpan('MyService.doWork', async (span) => {
 *       span.setAttribute('escrow.id', escrowId);
 *       // ... your code ...
 *     });
 *   }
 */
@Injectable()
export class TracingService {
  private readonly logger = new SanitizedLogger(TracingService.name);

  /**
   * Execute `fn` inside a new OpenTelemetry span.
   *
   * The span is automatically ended when `fn` resolves or rejects.
   * If OTel is not active the callback is invoked directly with a no-op span.
   */
  async withSpan<T>(
    spanName: string,
    fn: (span: OtelSpanLike) => Promise<T>,
    options?: { attributes?: Record<string, string | number | boolean> },
  ): Promise<T> {
    let tracer: OtelTracerLike | null = null;

    try {
      // Lazily resolve the OTel API so the module can be imported even when
      // @opentelemetry/api is not installed.
      const { trace, context, SpanStatusCode } = await import('@opentelemetry/api');
      tracer = trace.getTracer('trustflow-backend');

      return await tracer.startActiveSpan(spanName, async (span: OtelSpanLike) => {
        if (options?.attributes) {
          Object.entries(options.attributes).forEach(([k, v]) => span.setAttribute(k, v));
        }
        try {
          const result = await fn(span);
          (span as any).setStatus?.({ code: SpanStatusCode.OK });
          return result;
        } catch (err) {
          (span as any).setStatus?.({
            code: SpanStatusCode.ERROR,
            message: err instanceof Error ? err.message : String(err),
          });
          (span as any).recordException?.(err as Error);
          throw err;
        } finally {
          span.end();
        }
      });
    } catch {
      // OTel API not available — fall through to no-op path
    }

    // No-op fallback: execute fn with a stub span
    return fn(noopSpan());
  }

  /**
   * Add an attribute to the currently active span (if any).
   * Safe to call when OTel is not active.
   */
  setSpanAttribute(key: string, value: string | number | boolean): void {
    try {
      // Fire-and-forget import — if it fails there is nothing to do
      import('@opentelemetry/api')
        .then(({ trace }) => {
          const span = trace.getActiveSpan();
          if (span) span.setAttribute(key, value);
        })
        .catch(() => {});
    } catch {
      // ignore
    }
  }
}

// ── minimal structural types so callers get typing without depending on @opentelemetry/api ──

export interface OtelSpanLike {
  setAttribute(key: string, value: string | number | boolean): this;
  end(): void;
}

interface OtelTracerLike {
  startActiveSpan<T>(name: string, fn: (span: OtelSpanLike) => T): T;
}

function noopSpan(): OtelSpanLike {
  return {
    setAttribute() { return this; },
    end() {},
  };
}
