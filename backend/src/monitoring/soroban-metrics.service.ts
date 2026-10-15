import { Injectable, OnModuleInit } from '@nestjs/common';
import { MetricsService, DEFAULT_DURATION_BUCKETS_SECONDS } from './metrics.service';

/**
 * Metric names for Soroban RPC observability.
 * Exposed as constants so tests and other services can reference them without
 * embedding raw strings.
 */
export const SOROBAN_METRICS = {
  /**
   * Histogram: duration (seconds) of individual Soroban RPC calls.
   * Labels: `method` (RPC method name), `status` ('success' | 'error').
   */
  RPC_DURATION: 'soroban_rpc_duration_seconds',

  /**
   * Counter: total Soroban RPC calls broken down by method and failure code.
   * Labels: `method`, `failure_code` (error code string or 'none' for success).
   */
  RPC_CALLS_TOTAL: 'soroban_rpc_calls_total',

  /**
   * Gauge: difference between the chain's latest ledger and the last ledger
   * successfully processed by the local indexer.  A rising value means the
   * indexer is falling behind the chain tip.
   */
  INDEXER_LEDGER_LAG: 'soroban_indexer_ledger_lag',
} as const;

/**
 * SorobanMetricsService registers and exposes the three Soroban observability
 * metrics declared in `SOROBAN_METRICS`.  It is intentionally thin — the heavy
 * lifting (recording observations, updating gauges) is done by the callers
 * (e.g. `SorobanMetricsInterceptor`, `SorobanEventIndexerService`).
 *
 * Registered as a provider in `MonitoringModule` so it is available globally.
 */
@Injectable()
export class SorobanMetricsService implements OnModuleInit {
  constructor(private readonly metrics: MetricsService) {}

  onModuleInit(): void {
    // Register histogram for RPC call durations
    this.metrics.registerHistogram(
      SOROBAN_METRICS.RPC_DURATION,
      'Duration of Soroban RPC calls in seconds, partitioned by method and status',
      DEFAULT_DURATION_BUCKETS_SECONDS,
    );

    // Register gauge for indexer ledger lag
    this.metrics.registerGauge(
      SOROBAN_METRICS.INDEXER_LEDGER_LAG,
      'Number of ledgers the local Soroban event indexer is behind the chain tip',
    );
  }

  // ─── Duration helpers ────────────────────────────────────────────────────────

  /**
   * Record a successful RPC call duration.
   *
   * @param method     - RPC method name (e.g. 'getEvents', 'getHealth')
   * @param durationMs - Wall-clock duration of the call in milliseconds
   */
  recordRpcSuccess(method: string, durationMs: number): void {
    this.metrics.observeHistogramMs(SOROBAN_METRICS.RPC_DURATION, durationMs, {
      method,
      status: 'success',
    });
    this.metrics.increment(SOROBAN_METRICS.RPC_CALLS_TOTAL, {
      method,
      failure_code: 'none',
    });
  }

  /**
   * Record a failed RPC call duration and failure code.
   *
   * @param method      - RPC method name
   * @param durationMs  - Wall-clock duration until the error was thrown
   * @param failureCode - Machine-readable error code (e.g. 'ECONNREFUSED', 'timeout', '-32600')
   */
  recordRpcFailure(method: string, durationMs: number, failureCode: string): void {
    this.metrics.observeHistogramMs(SOROBAN_METRICS.RPC_DURATION, durationMs, {
      method,
      status: 'error',
    });
    this.metrics.increment(SOROBAN_METRICS.RPC_CALLS_TOTAL, {
      method,
      failure_code: failureCode,
    });
  }

  // ─── Ledger lag gauge ────────────────────────────────────────────────────────

  /**
   * Update the indexer ledger lag gauge.
   *
   * Call this after each successful indexer poll with the difference between
   * the chain's latest ledger and the last ledger the indexer processed.
   *
   * @param lag - Non-negative integer ledger count.  0 means fully caught up.
   */
  setIndexerLedgerLag(lag: number): void {
    this.metrics.setGauge(SOROBAN_METRICS.INDEXER_LEDGER_LAG, Math.max(0, lag));
  }
}
