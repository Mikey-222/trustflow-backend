import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
  pageSize?: number;
}

export class PaginationDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: `Number of items per page (max ${MAX_PAGE_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional({
    default: DEFAULT_PAGE_LIMIT,
    minimum: 1,
    maximum: MAX_PAGE_LIMIT,
    description: `Page size alias for limit (max ${MAX_PAGE_LIMIT})`,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  pageSize?: number = DEFAULT_PAGE_LIMIT;
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.trunc(value));
}

/**
 * Resolve a raw page/limit/pageSize into validated values (#913).
 *
 * `page` is clamped to a minimum of 1 so callers can never accidentally turn
 * `Array.prototype.slice`'s negative-start behaviour into reading from the end
 * of the list. `limit` and `pageSize` are clamped to `[1, MAX_PAGE_LIMIT]`.
 */
export function normalizePagination(query: PaginationQuery = {}): Required<PaginationQuery> {
  const rawLimit = query.pageSize !== undefined ? query.pageSize : query.limit;
  const clampedLimit = Math.min(positiveInteger(rawLimit, DEFAULT_PAGE_LIMIT), MAX_PAGE_LIMIT);
  return {
    page: positiveInteger(query.page, 1),
    limit: clampedLimit,
    pageSize: clampedLimit,
  };
}

export function paginate<T>(items: T[], query: PaginationQuery = {}): PaginatedResponse<T> {
  const { page, limit } = normalizePagination(query);
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total: items.length,
    page,
    limit,
  };
}
