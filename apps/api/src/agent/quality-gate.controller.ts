import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { BenchmarkRunnerService } from './benchmark-runner.service';

@Controller('quality-gate')
export class QualityGateController {
  constructor(private readonly benchmarkService: BenchmarkRunnerService) {}

  @Post('suites')
  async createSuite(
    @Body('name') name: string,
    @Body('description') description: string,
  ) {
    if (!name || !description) {
      throw new BadRequestException('Name and description are required.');
    }
    return this.benchmarkService.createSuite(name, description);
  }

  @Post('suites/:suiteId/cases')
  async createTestCase(
    @Param('suiteId') suiteId: string,
    @Body('inputGoal') inputGoal: string,
    @Body('expectedPlan') expectedPlan: any,
    @Body('goldenOutput') goldenOutput: any,
  ) {
    if (!inputGoal) {
      throw new BadRequestException('inputGoal is required.');
    }
    return this.benchmarkService.createTestCase(
      suiteId,
      inputGoal,
      expectedPlan,
      goldenOutput,
    );
  }

  @Post('suites/:suiteId/run')
  async runSuite(
    @Param('suiteId') suiteId: string,
    @Body('commitSha') commitSha: string,
  ) {
    if (!commitSha) {
      throw new BadRequestException('commitSha is required.');
    }
    return this.benchmarkService.runSuite(suiteId, commitSha);
  }

  @Get('suites/:suiteId/history')
  async getHistory(@Param('suiteId') suiteId: string) {
    return this.benchmarkService.getSuiteHistory(suiteId);
  }
}
