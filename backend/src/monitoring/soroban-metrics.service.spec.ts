import { Test, TestingModule } from '@nestjs/testing';
import { SorobanMetricsService, SOROBAN_METRICS } from './soroban-metrics.service';
import { MetricsService } from './metrics.service';

describe('SorobanMetricsService', () => {
  let service: SorobanMetricsService;
  let metrics: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService, SorobanMetricsService],
    }).compile();

    service = module.get(SorobanMetricsService);
    metrics = module.get(MetricsService);

    // Trigger metric registration
    service.onModuleInit();
  });

  describe('metric registration', () => {
    it('registers soroban_rpc_duration_seconds histogram', () => {
      const output = metrics.toPrometheus();
      expect(output).toContain(`# TYPE ${SOROBAN_METRICS.RPC_DURATION} histogram`);
      expect(output).toContain(`${SOROBAN_METRICS.RPC_DURATION}_bucket`);
    });

    it('registers soroban_indexer_ledger_lag gauge', () => {
      const output = metrics.toPrometheus();
      expect(output).toContain(`# TYPE ${SOROBAN_METRICS.INDEXER_LEDGER_LAG} gauge`);
    });

    it('is idempotent — re-registering does not reset existing observations', () => {
      service.recordRpcSuccess('getEvents', 42);
      service.onModuleInit(); // re-register
      const output = metrics.toPrometheus();
      // Histogram count should still reflect the one observation
      expect(output).toMatch(new RegExp(`${SOROBAN_METRICS.RPC_DURATION}_count.* 1`));
    });
  });

  describe('recordRpcSuccess', () => {
    it('increments histogram and counter with success labels', () => {
      service.recordRpcSuccess('getEvents', 150);

      const output = metrics.toPrometheus();

      // Histogram should have at least one non-zero bucket (150ms = 0.15s)
      // The 0.25s bucket and above should all have count=1
      expect(output).toContain(SOROBAN_METRICS.RPC_DURATION);
      expect(output).toMatch(
        new RegExp(`${SOROBAN_METRICS.RPC_DURATION}_count\\{.*status="success".*\\} 1`),
      );
      expect(output).toMatch(
        new RegExp(`${SOROBAN_METRICS.RPC_CALLS_TOTAL}\\{.*failure_code="none".*\\} 1`),
      );
    });

    it('accumulates multiple calls', () => {
      service.recordRpcSuccess('getEvents', 10);
      service.recordRpcSuccess('getEvents', 20);
      service.recordRpcSuccess('getEvents', 30);

      const output = metrics.toPrometheus();
      expect(output).toMatch(
        new RegExp(`${SOROBAN_METRICS.RPC_DURATION}_count\\{.*status="success".*\\} 3`),
      );
    });
  });

  describe('recordRpcFailure', () => {
    it('increments histogram and counter with error labels', () => {
      service.recordRpcFailure('getEvents', 200, 'ECONNREFUSED');

      const output = metrics.toPrometheus();
      expect(output).toMatch(
        new RegExp(`${SOROBAN_METRICS.RPC_DURATION}_count\\{.*status="error".*\\} 1`),
      );
      expect(output).toMatch(
        new RegExp(`${SOROBAN_METRICS.RPC_CALLS_TOTAL}\\{.*failure_code="ECONNREFUSED".*\\} 1`),
      );
    });

    it('tracks different failure codes independently', () => {
      service.recordRpcFailure('getHealth', 50, 'timeout');
      service.recordRpcFailure('getHealth', 80, '-32600');

      const output = metrics.toPrometheus();
      expect(output).toContain('failure_code="timeout"');
      expect(output).toContain('failure_code="-32600"');
    });
  });

  describe('setIndexerLedgerLag', () => {
    it('sets the lag gauge to the provided value', () => {
      service.setIndexerLedgerLag(42);

      const output = metrics.toPrometheus();
      expect(output).toMatch(new RegExp(`${SOROBAN_METRICS.INDEXER_LEDGER_LAG}.* 42`));
    });

    it('clamps negative values to 0', () => {
      service.setIndexerLedgerLag(-5);

      const output = metrics.toPrometheus();
      expect(output).toMatch(new RegExp(`${SOROBAN_METRICS.INDEXER_LEDGER_LAG}.* 0`));
    });

    it('can be updated to reflect the latest lag', () => {
      service.setIndexerLedgerLag(10);
      service.setIndexerLedgerLag(0);

      const output = metrics.toPrometheus();
      expect(output).toMatch(new RegExp(`${SOROBAN_METRICS.INDEXER_LEDGER_LAG}.* 0`));
    });
  });
});
