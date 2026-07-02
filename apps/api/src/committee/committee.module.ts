import { Module } from '@nestjs/common';
import { CommitteeService } from './committee.service';
import { CommitteeController } from './committee.controller';
import { UnderwriteModule } from '../underwrite/underwrite.module';
import { EventModule } from '../event/event.module';

@Module({
  imports: [UnderwriteModule, EventModule],
  controllers: [CommitteeController],
  providers: [CommitteeService],
})
export class CommitteeModule {}
