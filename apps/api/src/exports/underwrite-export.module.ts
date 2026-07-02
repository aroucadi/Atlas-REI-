import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UnderwriteExportController } from './underwrite-export.controller';
import { UnderwriteExportService } from './underwrite-export.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [UnderwriteExportController],
  providers: [UnderwriteExportService],
  exports: [UnderwriteExportService],
})
export class UnderwriteExportModule {}
