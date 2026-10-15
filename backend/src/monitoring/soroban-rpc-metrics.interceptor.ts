import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SorobanMetricsService } from './soroban-metrics.service';

/**
 * SorobanRpcMetricsInterceptor can be applied to any NestJS handler whose
 * execution represents a Soroban RPC call.  It records the wall-clock duration
 * and result into `SorobanMetricsService`.
 *
 * For use with non-HTTP code paths (e.g. scheduled tasks that call RPC methods
 * directly), prefer the standalone `wrapSorobanRpc` helper below, which does
 * not depend on NestJS execution contexts.
 *
 * @example
 * // On a controller method:
 * @UseInterceptors(SorobanRpcMetricsInterceptor)
 * @Get('events')
 * async getEvents() { ... }
 */
@Injectable()
export class SorobanRpcMetricsInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SorobanRpcMetricsInterceptor.name);

  constructor(private readonly sorobanMetrics: SorobanMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const method = this.resolveMethodName(context);
    const startMs = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.sorobanMetrics.recordRpcSuccess(method, Date.now() - startMs);
      }),
      catchError(err => {
        const failureCode = this.extractFailureCode(err);
        this.sorobanMetrics.recordRpcFailure(method, Date.now() - startMs, failureCode);
        this.logger.debug(
          `Soroban RPC ${method} failed after ${Date.now() - startMs}ms: ${failureCode}`,
        );
        throw err;
      }),
    );
  }

  private resolveMethodName(context: ExecutionContext): string {
    // Use the handler function name as the RPC method label when available
    const handler = context.getHandler();
    return handler?.name ?? 'unknown';
  }

  private extractFailureCode(err: unknown): string {
    if (err instanceof Error) {
      // JSON-RPC error codes are numeric strings like '-32600'
      const match = err.message.match(/(-?\d{4,6})/);
      if (match) return match[1];
      // Network-level codes
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code) return nodeErr.code;
      if (err.message.toLowerCase().includes('timeout')) return 'timeout';
      return 'error';
    }
    return 'unknown';
  }
}

/**
 * Standalone helper to wrap an arbitrary async Soroban RPC call with metrics
 * recording.  Use this in services/workers that cannot use NestJS interceptors.
 *
 * @param sorobanMetrics - Injected `SorobanMetricsService`
 * @param method         - RPC method name for the label (e.g. 'getEvents')
 * @param fn             - Async function that performs the RPC call
 *
 * @example
 * const events = await wrapSorobanRpc(
 *   this.sorobanMetrics,
 *   'getEvents',
 *   () => this.rpcServer.getEvents(params),
 * );
 */
export async function wrapSorobanRpc<T>(
  sorobanMetrics: SorobanMetricsService,
  method: string,
  fn: () => Promise<T>,
): Promise<T> {
  const startMs = Date.now();
  try {
    const result = await fn();
    sorobanMetrics.recordRpcSuccess(method, Date.now() - startMs);
    return result;
  } catch (err) {
    let failureCode = 'unknown';
    if (err instanceof Error) {
      const match = err.message.match(/(-?\d{4,6})/);
      if (match) {
        failureCode = match[1];
      } else {
        const nodeErr = err as NodeJS.ErrnoException;
        failureCode = nodeErr.code ?? (err.message.toLowerCase().includes('timeout') ? 'timeout' : 'error');
      }
    }
    sorobanMetrics.recordRpcFailure(method, Date.now() - startMs, failureCode);
    throw err;
  }
}
