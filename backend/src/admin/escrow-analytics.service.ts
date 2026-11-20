import { Inject, Injectable, Optional } from '@nestjs/common';
import { SanitizedLogger } from '../common/logging/sanitized-logger';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { Redis } from 'ioredis';
import { config } from '../config/env.config';
import { MetricsService } from '../monitoring/metrics.service';
import { EscrowService } from '../escrow/escrow.service';
import { EscrowEntity } from '../escrow/escrow.entity';

const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 200;

/**
 * Service for optimized escrow analytics with cursor-based pagination and
 * pre-computed Redis counters. Eliminates the full table scan that was
 * causing 30-second gateway timeouts on production datasets.
 */
@Injectable()
export class EscrowAnalyticsService {
  private readonly logger = new SanitizedLogger(EscrowAnalyticsService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
    @Optional() @Inject(MetricsService) private readonly metrics?: MetricsService,
    @Optional() @Inject(EscrowService) private readonly escrowService?: EscrowService,
  ) {}

  /**
   * Get paginated escrow analytics with cursor-based pagination.
   *
   * Uses Redis ZSET range queries for efficient pagination and pre-computed
   * Redis counters for total count, eliminating the O(n) full table scan.
   *
   * Query params:
   * - limit: number of records to return (default: 50, max: 200)
   * - cursor: opaque cursor for pagination (base64-encoded timestamp:escrowId)
   *
   * Returns: { data: EscrowAnalytics, pagination: { total, limit, cursor, hasMore } }
   */
  async getPaginatedEscrowAnalytics(
    limit = DEFAULT_PAGE_LIMIT,
    cursor?: string,
  ): Promise<{
    data: {
      total: number;
      byStatus: Record<string, number>;
      totalValueXLM: string;
    };
    pagination: {
      total: number;
      limit: number;
      cursor: string | null;
      hasMore: boolean;
    };
  }> {
    // Validate limit
    const effectiveLimit = Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);

    // Use Redis counters for total count if available
    const redisTotal = await this.redis?.get('escrow:total_count');
    const total = redisTotal ? Math.max(parseInt(redisTotal, 10), 0) : 0;

    // Get status breakdown from Redis counters per status
    const statuses = ['pending', 'active', 'released', 'disputed', 'cancelled'];
    const byStatus: Record<string, number> = {} as Record<string, number>;

    // Fetch each status count from Redis
    if (this.redis) {
      for (const status of statuses) {
        const countKey = `escrow:count:${status}`;
        const count = await this.redis.get(countKey);
        byStatus[status] = count ? Math.max(parseInt(count, 10), 0) : 0;
      }
    } else {
      // Fall back to service query if no Redis
      if (this.escrowService) {
        const allEscrows = await this.escrowService.findAll();
        for (const escrow of allEscrows) {
          const status = escrow.status;
          byStatus[status] = (byStatus[status] ?? 0) + 1;
        }
      }
    }

    // Calculate total value XLM from Redis counter
    const redisTotalValue = await this.redis?.get('escrow:total_value_xlm');
    const totalValueXLM = redisTotalValue ?? '0';

    // Parse compound cursor: (createdAtScore, id) to prevent pagination gaps & duplicates (#912)
    let cursorScore: number | undefined;
    let cursorId: string | undefined;
    if (cursor) {
      const parts = cursor.split(':');
      if (parts.length >= 2) {
        cursorScore = parseFloat(parts[0]);
        cursorId = parts.slice(1).join(':');
      } else {
        cursorScore = parseFloat(cursor);
      }
    }

    let rawItems: any[] = [];
    let newCursor: string | null = null;
    let hasMore = false;

    if (this.redis) {
      const scoreMin = cursorScore !== undefined ? cursorScore : '-inf';
      const rangeLimit = effectiveLimit * 2 + 1; // Fetch buffer to allow compound filtering
      const rangeResults = await this.redis.zrangebyscore(
        'escrows:index',
        scoreMin,
        '+inf',
        'LIMIT',
        0,
        rangeLimit,
      );

      // Filter with compound cursor (createdAt, id)
      let filteredIds: string[] = [];
      if (cursorScore !== undefined && cursorId !== undefined) {
        for (const id of rangeResults) {
          const score = await this.redis.zscore('escrows:index', id);
          const numScore = score !== null ? parseFloat(score) : 0;
          if (numScore > cursorScore || (numScore === cursorScore && id > cursorId)) {
            filteredIds.push(id);
          }
        }
      } else {
        filteredIds = rangeResults;
      }

      hasMore = filteredIds.length > effectiveLimit;
      const actualLimit = hasMore ? effectiveLimit : filteredIds.length;
      const idsToFetch = filteredIds.slice(0, actualLimit);

      if (idsToFetch.length > 0 && this.escrowService) {
        const escrowKeys = idsToFetch.map(id => `escrow:${id}`);
        const raw = await this.escrowService['redis']!.mget(...escrowKeys);
        rawItems = raw.filter((r): r is string => r !== null).map(r => JSON.parse(r));
      } else if (idsToFetch.length > 0) {
        rawItems = idsToFetch.map((id: string) => ({ id, status: 'pending' }));
      }

      if (idsToFetch.length > 0) {
        const lastId = idsToFetch[idsToFetch.length - 1];
        const lastScore = await this.redis.zscore('escrows:index', lastId);
        if (lastScore !== null) {
          newCursor = `${lastScore}:${lastId}`;
        }
      }
    } else {
      // Fallback without Redis - deterministic compound sorting by (createdAt, id) (#912)
      if (this.escrowService) {
        let allEscrows = await this.escrowService.findAll();
        allEscrows.sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          if (timeA !== timeB) return timeA - timeB;
          return a.id.localeCompare(b.id);
        });

        if (cursorScore !== undefined && cursorId !== undefined) {
          allEscrows = allEscrows.filter(item => {
            const itemTime = new Date(item.createdAt).getTime();
            if (itemTime > cursorScore!) return true;
            if (itemTime === cursorScore! && item.id > cursorId!) return true;
            return false;
          });
        }

        hasMore = allEscrows.length > effectiveLimit;
        rawItems = allEscrows.slice(0, effectiveLimit);

        if (rawItems.length > 0) {
          const lastItem = rawItems[rawItems.length - 1];
          const lastScore = new Date(lastItem.createdAt).getTime();
          newCursor = `${lastScore}:${lastItem.id}`;
        }
      }
    }

    // Build the response - convert to EscrowEntity-light shape
    const escrowEntities: Array<{ id: string; status: string; amountXLM: string; createdAt: string }> = [];
    for (const item of rawItems) {
      escrowEntities.push({
        id: item?.id ?? '',
        status: item?.status ?? 'pending',
        amountXLM: item?.amountXLM ?? '0',
        createdAt: item?.createdAt ?? new Date().toISOString(),
      });
    }

    // Build the response
    const pagination = {
      total,
      limit: effectiveLimit,
      cursor: newCursor ?? null,
      hasMore,
    };

    const data = {
      total,
      byStatus,
      totalValueXLM,
    };

    return { data, pagination };
  }
}