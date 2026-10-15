import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Transform } from 'stream';
import * as crypto from 'crypto';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AuditExportService } from './audit-export.service';

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/audit')
export class AuditExportController {
  constructor(private readonly auditExportService: AuditExportService) {}

  @Get('export')
  @ApiOperation({
    summary: 'Export audit logs as CSV or JSON',
    description:
      'Streams audit logs filtered by date range and/or escrow ID. ' +
      'Returns a file download with a SHA-256 checksum header for integrity verification.',
  })
  @ApiQuery({
    name: 'format',
    required: false,
    enum: ['csv', 'json'],
    description: 'Export format (default: csv)',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: 'string',
    description: 'Start date (ISO 8601) for filtering audit logs',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: 'string',
    description: 'End date (ISO 8601) for filtering audit logs',
  })
  @ApiQuery({
    name: 'escrowId',
    required: false,
    type: 'string',
    description: 'Filter by specific escrow ID',
  })
  @ApiResponse({ status: 200, description: 'Audit log file stream' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  async exportAuditLogs(
    @Res() res: Response,
    @Query('format') format: 'csv' | 'json' = 'csv',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('escrowId') escrowId?: string,
  ): Promise<void> {
    const { stream, contentType, filename } = await this.auditExportService.exportLogs({
      format,
      startDate,
      endDate,
      escrowId,
    });

    const hash = crypto.createHash('sha256');

    const checksumTransform = new Transform({
      transform(chunk: Buffer, _encoding: string, callback: Function) {
        hash.update(chunk);
        callback(null, chunk);
      },
      flush(callback: Function) {
        const checksum = hash.digest('hex');
        try {
          (res as any).setTrailers({ 'X-Content-SHA256': checksum });
        } catch {
          // Trailers not supported — data is still valid
        }
        callback();
      },
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Trailer', 'X-Content-SHA256');
    res.setHeader('X-Export-Format', format);

    stream.pipe(checksumTransform).pipe(res);
  }
}
