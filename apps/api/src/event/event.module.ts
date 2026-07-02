import { Module } from '@nestjs/common';
import { EventController } from './event.controller';
import { EventService } from './event.service';
import { ForexService } from './forex.service';

@Module({
  controllers: [EventController],
  providers: [EventService, ForexService],
  exports: [EventService, ForexService],
})
export class EventModule {}
