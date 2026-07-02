import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async register(email: string, fullName: string, passwordString: string) {
    const existing = await this.db.client.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(passwordString, 10);

    // Generate a unique slug from email
    const baseSlug = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    let slug = `${baseSlug}-org`;

    let count = 1;
    while (true) {
      const existingOrg = await this.db.client.organization.findUnique({
        where: { slug },
      });
      if (!existingOrg) {
        break;
      }
      slug = `${baseSlug}-org-${count++}`;
    }

    return this.db.client.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          fullName,
          authProvider: 'local',
          passwordHash,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: `${fullName}'s Organization`,
          slug,
          planTier: 'starter',
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          role: 'owner',
        },
      });

      const workspace = await tx.workspace.create({
        data: {
          organizationId: org.id,
          name: 'First Workspace',
          workspaceType: 'investment',
          createdByUserId: user.id,
        },
      });

      const profile = await tx.investorProfile.create({
        data: {
          workspaceId: workspace.id,
          name: 'Default Target Profile',
          baseCurrency: 'AED',
          capitalAvailable: 2000000,
          riskTolerance: 'moderate',
          investmentHorizonMonths: 60,
          incomeVsGrowthPreference: 'balanced',
          financingPreference: 'mortgage',
          targetCountriesJson: ['AE', 'ES'],
          constraintsJson: {},
          goalsJson: {},
          createdByUserId: user.id,
        },
      });

      return {
        user,
        organization: org,
        workspace,
        profile,
        property: null,
      };
    });
  }

  async login(email: string, passwordString: string) {
    const user = await this.db.client.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(passwordString, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { userId: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return {
      accessToken: token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        memberships: user.memberships,
        defaultPropertyId: null,
      },
    };
  }
}
