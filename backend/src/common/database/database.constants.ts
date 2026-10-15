/** Injection token for the primary (write) PostgreSQL pool. */
export const PG_POOL = 'PG_POOL';

/**
 * Injection token for the read-replica pool array.
 * Resolves to `null` when no replicas are configured — callers that depend on
 * this token must declare it `@Optional()` and fall back to the primary pool.
 */
export const PG_READ_POOLS = 'PG_READ_POOLS';
