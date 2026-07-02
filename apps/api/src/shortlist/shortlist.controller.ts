import {
  Controller,
  UseGuards,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { ShortlistService } from './shortlist.service';
import {
  CreateShortlistSchema,
  AddShortlistItemSchema,
} from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/shortlists')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class ShortlistController {
  constructor(private readonly shortlistService: ShortlistService) {}

  @Get()
  async getShortlists(@Param('workspaceId') workspaceId: string) {
    return this.shortlistService.getShortlists(workspaceId);
  }

  @Post()
  async createShortlist(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const parsed = CreateShortlistSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    const userId = req.user?.id;
    return this.shortlistService.createShortlist(
      workspaceId,
      parsed.data,
      userId,
    );
  }

  @Post(':shortlistId/items')
  async addShortlistItem(
    @Param('workspaceId') workspaceId: string,
    @Param('shortlistId') shortlistId: string,
    @Body() body: any,
  ) {
    const parsed = AddShortlistItemSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.shortlistService.addShortlistItem(
      workspaceId,
      shortlistId,
      parsed.data,
    );
  }

  @Delete(':shortlistId/items/:itemId')
  async removeShortlistItem(
    @Param('workspaceId') workspaceId: string,
    @Param('shortlistId') shortlistId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.shortlistService.removeShortlistItem(
      workspaceId,
      shortlistId,
      itemId,
    );
  }
}
