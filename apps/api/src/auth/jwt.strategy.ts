import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly db: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: { userId: string }) {
    const user = await this.db.client.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        authProvider: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        memberships: {
          select: {
            id: true,
            organizationId: true,
            userId: true,
            role: true,
            createdAt: true,
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }
}
