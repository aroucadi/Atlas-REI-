import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { PromptRegistryService } from './prompt-registry.service';

@Controller('admin/prompts')
export class PromptRegistryController {
  constructor(private readonly promptRegistry: PromptRegistryService) {}

  @Get(':name/versions')
  async getVersions(@Param('name') name: string) {
    return this.promptRegistry.getVersions(name);
  }

  @Post(':name/update')
  async updatePrompt(
    @Param('name') name: string,
    @Body('content') content: string,
    @Body('schemaJson') schemaJson?: any,
  ) {
    return this.promptRegistry.registerPrompt(name, content, schemaJson || {});
  }

  @Post(':name/rollback/:version')
  async rollbackPrompt(
    @Param('name') name: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.promptRegistry.rollbackPrompt(name, version);
  }
}
