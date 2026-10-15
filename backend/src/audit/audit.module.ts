import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditExportService } from './audit-export.service';
import { AuditExportController } from './audit-export.controller';
import { AdminGuard } from '../admin/admin.guard';

@Global()
@Module({
  controllers: [AuditController, AuditExportController],
  providers: [AuditService, AuditExportService, AdminGuard],
  exports: [AuditService, AuditExportService],
})
export class AuditModule {}
