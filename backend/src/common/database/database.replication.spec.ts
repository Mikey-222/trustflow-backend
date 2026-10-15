/**
 * Unit tests for read/write splitting configuration.
 *
 * These tests run entirely in-process with no real Postgres connection.
 * They verify that:
 *   - buildReplicaPoolConfigs() parses DATABASE_READ_REPLICAS correctly
 *   - DatabaseService.queryRead() routes to replicas (or falls back to primary)
 *   - DatabaseService.query() always routes to the primary pool
 */

import { buildReplicaPoolConfigs } from './database.module';
import { DatabaseService } from './database.service';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Minimal mock pool that records every query call. */
function mockPool(label: string) {
  const calls: string[] = [];
  return {
    _label: label,
    _calls: calls,
    query: jest.fn(async (sql: string) => {
      calls.push(sql);
      return { rows: [{ label }], rowCount: 1 };
    }),
    end: jest.fn(async () => {}),
    on: jest.fn(),
    connect: jest.fn(async () => ({ release: jest.fn() })),
  };
}

// ── buildReplicaPoolConfigs ───────────────────────────────────────────────────

describe('buildReplicaPoolConfigs', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('returns empty array when DATABASE_READ_REPLICAS is not set', () => {
    // We exercise through a mock config so we do not need a live validateEnv()
    // The function reads config.DATABASE_READ_REPLICAS; mock it to undefined.
    jest.doMock('../../config/env.config', () => ({
      config: { DATABASE_READ_REPLICAS: undefined, DB_SSL: 'false', NODE_ENV: 'test' },
    }));
    // Re-require after mock
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReplicaPoolConfigs: fn } = require('./database.module');
    expect(fn()).toEqual([]);
  });

  it('returns one config per comma-separated URL', () => {
    jest.doMock('../../config/env.config', () => ({
      config: {
        DATABASE_READ_REPLICAS:
          'postgres://replica1:5432/db,postgres://replica2:5432/db',
        DB_SSL: 'false',
        DB_POOL_MAX: 5,
        DB_POOL_IDLE_TIMEOUT_MS: 30000,
        DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
        NODE_ENV: 'test',
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReplicaPoolConfigs: fn } = require('./database.module');
    const configs = fn();
    expect(configs).toHaveLength(2);
    expect(configs[0].connectionString).toBe('postgres://replica1:5432/db');
    expect(configs[1].connectionString).toBe('postgres://replica2:5432/db');
  });

  it('ignores empty strings in the comma-separated list', () => {
    jest.doMock('../../config/env.config', () => ({
      config: {
        DATABASE_READ_REPLICAS: 'postgres://replica1:5432/db,,  ',
        DB_SSL: 'false',
        NODE_ENV: 'test',
      },
    }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildReplicaPoolConfigs: fn } = require('./database.module');
    const configs = fn();
    expect(configs).toHaveLength(1);
  });
});

// ── DatabaseService routing ───────────────────────────────────────────────────

describe('DatabaseService read/write routing', () => {
  it('query() always uses the primary pool', async () => {
    const primary = mockPool('primary');
    const replica = mockPool('replica-0');

    const svc = new DatabaseService(primary as any, [replica as any]);
    await svc.query('SELECT 1');
    await svc.query('INSERT INTO foo VALUES (1)');

    expect(primary.query).toHaveBeenCalledTimes(2);
    expect(replica.query).not.toHaveBeenCalled();
  });

  it('queryRead() routes to replica when replicas are configured', async () => {
    const primary = mockPool('primary');
    const replica = mockPool('replica-0');

    const svc = new DatabaseService(primary as any, [replica as any]);
    await svc.queryRead('SELECT count(*) FROM audit_logs');

    expect(replica.query).toHaveBeenCalledTimes(1);
    expect(primary.query).not.toHaveBeenCalled();
  });

  it('queryRead() falls back to primary when no replicas configured', async () => {
    const primary = mockPool('primary');

    const svc = new DatabaseService(primary as any, null);
    await svc.queryRead('SELECT count(*) FROM audit_logs');

    expect(primary.query).toHaveBeenCalledTimes(1);
  });

  it('queryRead() distributes requests round-robin across replicas', async () => {
    const primary = mockPool('primary');
    const r0 = mockPool('replica-0');
    const r1 = mockPool('replica-1');
    const r2 = mockPool('replica-2');

    const svc = new DatabaseService(primary as any, [r0, r1, r2] as any[]);

    // 6 reads → 2 hits per replica
    for (let i = 0; i < 6; i++) {
      await svc.queryRead('SELECT 1');
    }

    expect(r0.query).toHaveBeenCalledTimes(2);
    expect(r1.query).toHaveBeenCalledTimes(2);
    expect(r2.query).toHaveBeenCalledTimes(2);
    expect(primary.query).not.toHaveBeenCalled();
  });

  it('hasReplicas returns false when PG_READ_POOLS is null', () => {
    const primary = mockPool('primary');
    const svc = new DatabaseService(primary as any, null);
    expect(svc.hasReplicas).toBe(false);
  });

  it('hasReplicas returns true when replicas are configured', () => {
    const primary = mockPool('primary');
    const replica = mockPool('replica-0');
    const svc = new DatabaseService(primary as any, [replica as any]);
    expect(svc.hasReplicas).toBe(true);
  });

  it('onModuleDestroy() ends both primary and replica pools', async () => {
    const primary = mockPool('primary');
    const r0 = mockPool('replica-0');
    const r1 = mockPool('replica-1');

    const svc = new DatabaseService(primary as any, [r0, r1] as any[]);
    await svc.onModuleDestroy();

    expect(primary.end).toHaveBeenCalledTimes(1);
    expect(r0.end).toHaveBeenCalledTimes(1);
    expect(r1.end).toHaveBeenCalledTimes(1);
  });
});
