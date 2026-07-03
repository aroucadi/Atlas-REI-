import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { CommitteeMemoController } from './committee-memo.controller';
import { CommitteeMemoService } from './committee-memo.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CommitteeMemoController],
  providers: [CommitteeMemoService],
  exports: [CommitteeMemoService],
})
export class CommitteeMemoModule {}
