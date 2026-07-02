import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly db: DatabaseService) {}

  async log(data: {
    organizationId?: string;
    workspaceId?: string;
    actorUserId?: string;
    entityType: string;
    entityId: string;
    action: string;
    beforeJson?: any;
    afterJson?: any;
  }) {
    return this.db.client.auditLog.create({
      data,
    });
  }

  // WORM Enforcement: Prevent modifying log entries in the application layer
  async updateAuditLog() {
    throw new ForbiddenException(
      'Compliance Veto: Audit logs are immutable (WORM policy enforced).',
    );
  }

  async deleteAuditLog() {
    throw new ForbiddenException(
      'Compliance Veto: Audit logs are immutable (WORM policy enforced).',
    );
  }
}
