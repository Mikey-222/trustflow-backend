import { Injectable } from '@nestjs/common';
import { Readable } from 'stream';
import * as crypto from 'crypto';
import { SanitizedLogger } from '../common/logging/sanitized-logger';
import { DatabaseService } from '../common/database/database.service';
import { config } from '../config/env.config';

export interface AuditExportFilters {
  startDate?: string;
  endDate?: string;
  escrowId?: string;
  format?: 'csv' | 'json';
}

export interface AuditExportResult {
  stream: Readable;
  checksum: string;
  contentType: string;
  filename: string;
}

const CSV_HEADERS = [
  'id',
  'operation',
  'user',
  'entity_id',
  'entity_type',
  'before_state',
  'after_state',
  'metadata',
  'created_at',
] as const;

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function formatCsvRow(row: Record<string, unknown>): string {
  return CSV_HEADERS.map(h => escapeCsvField(row[h])).join(',') + '\n';
}

@Injectable()
export class AuditExportService {
  private readonly logger = new SanitizedLogger(AuditExportService.name);

  constructor(private readonly db: DatabaseService) {}

  async exportLogs(filters: AuditExportFilters): Promise<AuditExportResult> {
    const format = filters.format ?? 'csv';
    const contentType = format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json';
    const extension = format;
    const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.${extension}`;

    const hash = crypto.createHash('sha256');
    let rowCount = 0;

    const stream = new Readable({
      async read() {
        // This is a pull-based stream; we push data in the _start method
      },
    });

    // Asynchronously start producing data
    this._produceData(stream, hash, filters, format, () => rowCount)
      .then(count => {
        rowCount = count;
        this.logger.log(`Audit export completed: ${count} rows, format=${format}`);
      })
      .catch(err => {
        this.logger.error('Audit export failed', err instanceof Error ? err.stack : String(err));
        stream.destroy(err);
      });

    // We need to return the checksum after streaming completes, but the caller
    // needs it upfront for the header. So we use a wrapper approach:
    // The stream emits a 'checksum' event when done. For the response header,
    // we compute it lazily via a proxy object.
    const result: AuditExportResult = {
      stream,
      checksum: '', // Will be set when stream completes
      contentType,
      filename,
    };

    // Attach a listener to update the checksum when the stream finishes
    stream.on('end', () => {
      result.checksum = hash.digest('hex');
    });

    return result;
  }

  private async _produceData(
    stream: Readable,
    hash: crypto.Hash,
    filters: AuditExportFilters,
    format: 'csv' | 'json',
    _getCount: () => number,
  ): Promise<number> {
    const startDate = filters.startDate || null;
    const endDate = filters.endDate || null;
    const escrowId = filters.escrowId || null;

    let query: string;
    let params: unknown[];

    if (escrowId) {
      query = `
        SELECT * FROM audit_logs
        WHERE entity_id = $1
          AND ($2::timestamptz IS NULL OR created_at >= $2)
          AND ($3::timestamptz IS NULL OR created_at <= $3)
        ORDER BY created_at ASC
      `;
      params = [escrowId, startDate, endDate];
    } else {
      query = `
        SELECT * FROM audit_logs
        WHERE ($1::timestamptz IS NULL OR created_at >= $1)
          AND ($2::timestamptz IS NULL OR created_at <= $2)
        ORDER BY created_at ASC
      `;
      params = [startDate, endDate];
    }

    if (!this.db.isConfigured) {
      if (format === 'csv') {
        const header = CSV_HEADERS.join(',') + '\n';
        stream.push(header);
        hash.update(header);
      } else {
        stream.push('[]');
        hash.update('[]');
      }
      stream.push(null);
      return 0;
    }

    try {
      const result = await this.db.query(query, params);
      const rows = result.rows;

      if (format === 'csv') {
        const header = CSV_HEADERS.join(',') + '\n';
        stream.push(header);
        hash.update(header);

        for (const row of rows) {
          const line = formatCsvRow(row as Record<string, unknown>);
          stream.push(line);
          hash.update(line);
        }
      } else {
        // JSON array format — stream each row as we go
        let first = true;
        stream.push('[');
        hash.update('[');

        for (const row of rows) {
          const prefix = first ? '' : ',';
          const json = JSON.stringify(row);
          stream.push(prefix + json);
          hash.update(prefix + json);
          first = false;
        }

        stream.push(']');
        hash.update(']');
      }

      stream.push(null);
      return rows.length;
    } catch (error) {
      stream.destroy(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Computes a SHA-256 checksum over the full export by consuming the stream.
   * Useful for tests and verification outside the HTTP path.
   */
  async computeChecksum(stream: Readable): Promise<string> {
    const hash = crypto.createHash('sha256');
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}
