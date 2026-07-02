import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class WorkspaceMembershipGuard implements CanActivate {
  constructor(private readonly db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    const workspaceId = request.params.workspaceId || request.body.workspaceId;
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID is required');
    }

    // Verify workspace exists
    const workspace = await this.db.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { organizationId: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Verify user is a member of the workspace's organization
    const membership = await this.db.client.organizationMembership.findFirst({
      where: {
        organizationId: workspace.organizationId,
        userId: user.id,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'User is not a member of this workspace organization',
      );
    }

    // Attach role to request context
    request.userRole = membership.role;

    const method = request.method;
    const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    if (isWrite && membership.role === 'viewer') {
      throw new ForbiddenException(
        'User with viewer role is not permitted to modify resources or trigger agent workflows',
      );
    }

    return true;
  }
}
