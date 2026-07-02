import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { AuditLogService } from './audit-log.service';

@Global()
@Module({
  providers: [DatabaseService, AuditLogService],
  exports: [DatabaseService, AuditLogService],
})
export class DatabaseModule {}
