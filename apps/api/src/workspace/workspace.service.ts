import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CreateWorkspaceInput } from '@atlas/shared-types';

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  async createWorkspace(userId: string, input: CreateWorkspaceInput) {
    // Enforce tenant boundary: Check if user is a member of this organization
    const membership = await this.db.client.organizationMembership.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: userId,
      },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this organization');
    }

    return this.db.client.workspace.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        workspaceType: input.workspaceType,
        createdByUserId: userId,
      },
    });
  }

  async getWorkspaces(userId: string) {
    // Fetch workspaces scoped to the organizations the user belongs to
    return this.db.client.workspace.findMany({
      where: {
        organization: {
          memberships: {
            some: {
              userId: userId,
            },
          },
        },
      },
      include: {
        organization: true,
      },
    });
  }
}
