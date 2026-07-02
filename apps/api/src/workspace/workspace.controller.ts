import {
  Controller,
  UseGuards,
  Post,
  Get,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceService } from './workspace.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateWorkspaceSchema } from '@atlas/shared-types';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  async createWorkspace(@CurrentUser() user: any, @Body() body: any) {
    const parsed = CreateWorkspaceSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.workspaceService.createWorkspace(user.id, parsed.data);
  }

  @Get()
  async getWorkspaces(@CurrentUser() user: any) {
    return this.workspaceService.getWorkspaces(user.id);
  }
}
