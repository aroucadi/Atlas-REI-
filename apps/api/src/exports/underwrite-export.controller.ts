import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { UnderwriteExportService } from './underwrite-export.service';

@Controller('workspaces/:workspaceId/underwrites')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class UnderwriteExportController {
  constructor(private readonly exportService: UnderwriteExportService) {}

  @Get(':id/export')
  async exportUnderwrite(
    @Param('workspaceId') workspaceId: string,
    @Param('id') underwriteRunId: string,
    @Res() res: Response,
  ) {
    const { workbook, fileName } = await this.exportService.buildWorkbook(
      workspaceId,
      underwriteRunId,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
