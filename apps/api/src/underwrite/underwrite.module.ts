import { Module } from '@nestjs/common';
import { UnderwriteService } from './underwrite.service';
import { UnderwriteController } from './underwrite.controller';
import { DatabaseModule } from '../database/database.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [DatabaseModule, EventModule],
  controllers: [UnderwriteController],
  providers: [UnderwriteService],
  exports: [UnderwriteService],
})
export class UnderwriteModule {}
