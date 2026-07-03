import {
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  NotFoundException,
  Res,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { DocumentService } from './document.service';
import { RentRollExtractionService } from './rent-roll-extraction.service';
import { T12ExtractionService } from './t12-extraction.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { UploadDocumentSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/documents')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class DocumentController {
  constructor(
    private readonly documentService: DocumentService,
    private readonly rentRollExtractionService: RentRollExtractionService,
    private readonly t12ExtractionService: T12ExtractionService,
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

  @Post(':id/extract-t12')
  async extractT12(
    @Param('workspaceId') workspaceId: string,
    @Param('id') documentId: string,
    @CurrentUser() user: any,
  ) {
    return this.t12ExtractionService.extract({
      documentId,
      workspaceId,
      requestedByUserId: user.id,
    });
  }

  @Get(':id/presigned-url')
  async getPresignedUrl(
    @Param('workspaceId') workspaceId: string,
    @Param('id') documentId: string,
  ) {
    try {
      return await this.documentService.getPresignedUrl(
        workspaceId,
        documentId,
      );
    } catch (err: any) {
      throw new NotFoundException(err.message);
    }
  }

  @Get(':id/file')
  async getDocumentFile(
    @Param('workspaceId') workspaceId: string,
    @Param('id') documentId: string,
    @Res() res: any,
  ) {
    try {
      const file = await this.documentService.getDocumentFile(
        workspaceId,
        documentId,
      );
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${file.fileName}"`,
      );
      return res.send(file.buffer);
    } catch (err: any) {
      throw new NotFoundException(err.message);
    }
  }

  @Get(':id/extraction')
  async getLatestExtraction(
    @Param('workspaceId') workspaceId: string,
    @Param('id') documentId: string,
  ) {
    let extraction;
    try {
      extraction = await this.documentService.getLatestExtraction(
        workspaceId,
        documentId,
      );
    } catch (err: any) {
      throw new NotFoundException(err.message);
    }
    if (!extraction) {
      throw new NotFoundException(
        `No extraction found for document ${documentId}`,
      );
    }
    return extraction;
  }
}
