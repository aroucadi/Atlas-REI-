import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EventService } from './event.service';

/**
 * Events Controller — Global Market Intelligence Feed
 *
 * Events are global market intelligence data, not tenant-scoped.
 * All authenticated users can read events across all organizations.
 * This is by design per schema.md: events are macroeconomic/geopolitical
 * data points that affect all investors equally. No WorkspaceMembershipGuard
 * is applied intentionally.
 */
@Controller('events')
@UseGuards(JwtAuthGuard)
export class EventController {
  constructor(private readonly eventService: EventService) {}

  @Get()
  async getEvents() {
    return this.eventService.getEvents();
  }
}
