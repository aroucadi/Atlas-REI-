import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppService } from './app.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CurrentUser } from './auth/current-user.decorator';
import { DatabaseService } from './database/database.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: any) {
    return {
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        memberships: user.memberships,
        defaultPropertyId: null,
      },
    };
  }
}
