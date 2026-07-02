import {
  Controller,
  UseGuards,
  Get,
  Post,
  Put,
  Param,
  Body,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { InvestorProfileService } from './investor-profile.service';
import { InvestorProfileSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/profiles')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class InvestorProfileController {
  constructor(private readonly profileService: InvestorProfileService) {}

  @Get()
  async getProfiles(@Param('workspaceId') workspaceId: string) {
    return this.profileService.getProfiles(workspaceId);
  }

  @Get(':profileId')
  async getProfile(
    @Param('workspaceId') workspaceId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.profileService.getProfile(workspaceId, profileId);
  }

  @Post()
  async createProfile(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const parsed = InvestorProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    const userId = req.user?.id;
    return this.profileService.createProfile(workspaceId, parsed.data, userId);
  }

  @Put(':profileId')
  async updateProfile(
    @Param('workspaceId') workspaceId: string,
    @Param('profileId') profileId: string,
    @Body() body: any,
  ) {
    const parsed = InvestorProfileSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.profileService.updateProfile(
      workspaceId,
      profileId,
      parsed.data,
    );
  }
}
