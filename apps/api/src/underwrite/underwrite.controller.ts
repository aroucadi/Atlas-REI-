import {
  Controller,
  Post,
  Body,
  Param,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { UnderwriteService } from './underwrite.service';
import { UnderwritePropertyInputSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/underwrite')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class UnderwriteController {
  constructor(private readonly underwriteService: UnderwriteService) {}

  @Post()
  async underwriteProperty(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    const parsed = UnderwritePropertyInputSchema.safeParse({
      ...body,
      workspaceId,
    });
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    return this.underwriteService.underwrite(parsed.data);
  }
}
