import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ShortlistService {
  constructor(private readonly db: DatabaseService) {}

  async getShortlists(workspaceId: string) {
    return this.db.client.shortlist.findMany({
      where: { workspaceId },
      include: {
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createShortlist(workspaceId: string, input: any, userId?: string) {
    return this.db.client.shortlist.create({
      data: {
        workspaceId,
        name: input.name,
        investorProfileId: input.investorProfileId || null,
        createdByUserId: userId,
      },
    });
  }

  async addShortlistItem(workspaceId: string, shortlistId: string, input: any) {
    const shortlist = await this.db.client.shortlist.findFirst({
      where: { id: shortlistId, workspaceId },
    });
    if (!shortlist) {
      throw new NotFoundException(
        `Shortlist with ID ${shortlistId} not found in workspace ${workspaceId}`,
      );
    }

    return this.db.client.shortlistItem.create({
      data: {
        shortlistId,
        entityType: input.entityType,
        entityId: input.entityId,
        rankPosition: input.rankPosition || null,
        notes: input.notes || null,
      },
    });
  }

  async removeShortlistItem(
    workspaceId: string,
    shortlistId: string,
    itemId: string,
  ) {
    const shortlist = await this.db.client.shortlist.findFirst({
      where: { id: shortlistId, workspaceId },
    });
    if (!shortlist) {
      throw new NotFoundException(
        `Shortlist with ID ${shortlistId} not found in workspace ${workspaceId}`,
      );
    }

    const item = await this.db.client.shortlistItem.findFirst({
      where: { id: itemId, shortlistId },
    });
    if (!item) {
      throw new NotFoundException(
        `Shortlist item with ID ${itemId} not found in shortlist ${shortlistId}`,
      );
    }

    return this.db.client.shortlistItem.delete({
      where: { id: itemId },
    });
  }
}
