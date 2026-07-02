import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EventService {
  constructor(private readonly db: DatabaseService) {}

  async getEvents() {
    return this.db.client.event.findMany({
      include: {
        eventSource: true,
        impacts: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
