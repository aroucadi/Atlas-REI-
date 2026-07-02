import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RateLimiterGuard } from './rate-limiter.guard';
import { RegisterRequestSchema, LoginRequestSchema } from '@atlas/shared-types';

@Controller('auth')
@UseGuards(RateLimiterGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: any) {
    const parsed = RegisterRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    const result = await this.authService.register(
      parsed.data.email,
      parsed.data.fullName,
      parsed.data.passwordString,
    );
    return {
      message: 'User successfully registered',
      userId: result.user.id,
      organizationId: result.organization.id,
      workspaceId: result.workspace.id,
      propertyId: null,
    };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: any) {
    const parsed = LoginRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.authService.login(
      parsed.data.email,
      parsed.data.passwordString,
    );
  }

  @Post('logout')
  async logout() {
    return { message: 'Logged out successfully' };
  }
}
