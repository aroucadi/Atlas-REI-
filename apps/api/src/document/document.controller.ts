import {
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { DocumentService } from './document.service';
import { RentRollExtractionService } from './rent-roll-extraction.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadDocumentSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly rentRollExtractionService: RentRollExtractionService,
  ) {}

  @Get()
  async getDocuments(@Param('workspaceId') workspaceId: string) {
    return this.documentService.getDocuments(workspaceId);
  }

  @Post('upload')
  async uploadDocument(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const parsed = UploadDocumentSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.documentService.uploadDocument(
      workspaceId,
      user.id,
      parsed.data,
    );
  }

  @Post(':id/extract-rent-roll')
  async extractRentRoll(
    @Param('workspaceId') workspaceId: string,
    @Param('id') documentId: string,
    @CurrentUser() user: any,
  ) {
    return this.rentRollExtractionService.extract({
      documentId,
      workspaceId,
      requestedByUserId: user.id,
    });
  }
}
