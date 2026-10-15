import { Injectable } from '@nestjs/common';

interface Counter {
  name: string;
  value: number;
  labels: Record<string, string>;
  help?: string;
}

interface HistogramBucket {
  le: number; // upper bound (Infinity for +Inf bucket)
  count: number;
}

interface Histogram {
  name: string;
  help: string;
  labels: Record<string, string>;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

interface Gauge {
  name: string;
  help: string;
  value: number;
  labels: Record<string, string>;
}

/**
 * Default histogram upper bounds (seconds) for duration metrics.
 * Covers fast RPC calls (<10ms) through slow ones (>10s).
 */
export const DEFAULT_DURATION_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

@Injectable()
export class MetricsService {
  private counters = new Map<string, Counter>();
  private histograms = new Map<string, Histogram>();
  private gauges = new Map<string, Gauge>();

  // ─── Counter ───────────────────────────────────────────────────────────────

  increment(name: string, labels: Record<string, string> = {}, by = 1) {
    const key = `${name}:${JSON.stringify(labels)}`;
    const existing = this.counters.get(key);
    if (existing) {
      existing.value += by;
    } else {
      this.counters.set(key, { name, value: by, labels });
    }
  }

  getAll(): Counter[] {
    return [...this.counters.values()];
  }

  // ─── Histogram ─────────────────────────────────────────────────────────────

  /**
   * Register a histogram metric with explicit upper bounds.
   * Call once at startup (e.g. in a module constructor) before observing values.
   * Re-registering with the same name+labels is a no-op — the existing histogram
   * is preserved so in-flight observations are never lost.
   */
  registerHistogram(
    name: string,
    help: string,
    bucketUpperBounds: number[] = DEFAULT_DURATION_BUCKETS_SECONDS,
    labels: Record<string, string> = {},
  ): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (this.histograms.has(key)) return;
    const buckets: HistogramBucket[] = [
      ...bucketUpperBounds.map(le => ({ le, count: 0 })),
      { le: Infinity, count: 0 }, // +Inf bucket — always required by Prometheus
    ];
    this.histograms.set(key, { name, help, labels, buckets, sum: 0, count: 0 });
  }

  /**
   * Record a single observation into every histogram registered under `name`
   * whose label set matches `labels`.  The value is expected in **seconds**
   * for duration metrics; use `observeHistogramMs` for millisecond convenience.
   */
  observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const h = this.histograms.get(key);
    if (!h) return;
    h.sum += value;
    h.count++;
    for (const bucket of h.buckets) {
      if (value <= bucket.le) bucket.count++;
    }
  }

  /** Convenience wrapper: converts `durationMs` to seconds before observing. */
  observeHistogramMs(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    this.observeHistogram(name, durationMs / 1000, labels);
  }

  // ─── Gauge ─────────────────────────────────────────────────────────────────

  /**
   * Register a named gauge. Re-registration with the same key is a no-op.
   * Gauges can increase or decrease freely — unlike counters which only increase.
   */
  registerGauge(name: string, help: string, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    if (!this.gauges.has(key)) {
      this.gauges.set(key, { name, help, value: 0, labels });
    }
  }

  /** Set a gauge to an absolute value. */
  setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const g = this.gauges.get(key);
    if (g) {
      g.value = value;
    } else {
      // Auto-register if not explicitly registered first
      this.gauges.set(key, { name, help: name, value, labels });
    }
  }

  /** Increment a gauge by `by` (default 1). */
  incrementGauge(name: string, by = 1, labels: Record<string, string> = {}): void {
    const key = `${name}:${JSON.stringify(labels)}`;
    const g = this.gauges.get(key);
    if (g) {
      g.value += by;
    } else {
      this.gauges.set(key, { name, help: name, value: by, labels });
    }
  }

  /** Decrement a gauge by `by` (default 1). */
  decrementGauge(name: string, by = 1, labels: Record<string, string> = {}): void {
    this.incrementGauge(name, -by, labels);
  }

  // ─── Prometheus text format ─────────────────────────────────────────────────

  toPrometheus(): string {
    const lines: string[] = [];

    // Counters
    const counterGroups = new Map<string, Counter[]>();
    for (const c of this.counters.values()) {
      const group = counterGroups.get(c.name) ?? [];
      group.push(c);
      counterGroups.set(c.name, group);
    }
    for (const [name, group] of counterGroups) {
      lines.push(`# HELP ${name} ${group[0].help ?? name}`);
      lines.push(`# TYPE ${name} counter`);
      for (const c of group) {
        const lbl = this.formatLabels(c.labels);
        lines.push(`${name}${lbl} ${c.value}`);
      }
    }

    // Histograms
    const histogramGroups = new Map<string, Histogram[]>();
    for (const h of this.histograms.values()) {
      const group = histogramGroups.get(h.name) ?? [];
      group.push(h);
      histogramGroups.set(h.name, group);
    }
    for (const [name, group] of histogramGroups) {
      lines.push(`# HELP ${name} ${group[0].help}`);
      lines.push(`# TYPE ${name} histogram`);
      for (const h of group) {
        for (const bucket of h.buckets) {
          const le = bucket.le === Infinity ? '+Inf' : String(bucket.le);
          const lbl = this.formatLabels({ ...h.labels, le });
          lines.push(`${name}_bucket${lbl} ${bucket.count}`);
        }
        const baseLbl = this.formatLabels(h.labels);
        lines.push(`${name}_sum${baseLbl} ${h.sum}`);
        lines.push(`${name}_count${baseLbl} ${h.count}`);
      }
    }

    // Gauges
    const gaugeGroups = new Map<string, Gauge[]>();
    for (const g of this.gauges.values()) {
      const group = gaugeGroups.get(g.name) ?? [];
      group.push(g);
      gaugeGroups.set(g.name, group);
    }
    for (const [name, group] of gaugeGroups) {
      lines.push(`# HELP ${name} ${group[0].help}`);
      lines.push(`# TYPE ${name} gauge`);
      for (const g of group) {
        const lbl = this.formatLabels(g.labels);
        lines.push(`${name}${lbl} ${g.value}`);
      }
    }

    return lines.join('\n');
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    const lbl = entries.map(([k, v]) => `${k}="${v}"`).join(',');
    return `{${lbl}}`;
  }
}
