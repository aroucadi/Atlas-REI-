import {
  Controller,
  UseGuards,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { CopilotService } from './copilot.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CopilotChatRequestSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/copilot')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('chat')
  async chat(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const parsed = CopilotChatRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.copilotService.handleChat(workspaceId, user.id, parsed.data);
  }
}
