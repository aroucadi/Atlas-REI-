import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DocumentModule } from '../document/document.module';
import { CopilotController } from './copilot.controller';
import { CopilotService } from './copilot.service';

@Module({
  imports: [DatabaseModule, DocumentModule],
  controllers: [CopilotController],
  providers: [CopilotService],
  exports: [CopilotService],
})
export class CopilotModule {}
