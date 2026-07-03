import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { Prisma } from '@prisma/client';

export class AuditLogImmutabilityViolationError extends ForbiddenException {
  constructor(operation: string) {
    super(
      `Blocked attempt to call "${operation}" on audit_logs. ` +
        `audit_logs is a WORM (write-once-read-many) table. Only AuditLogService.log() is permitted.`,
    );
  }
}

const BLOCKED_OPERATIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

function createImmutableAuditLogDelegate(delegate: any): any {
  return new Proxy(delegate, {
    get(target, prop: string, receiver) {
      if (BLOCKED_OPERATIONS.has(prop)) {
        throw new AuditLogImmutabilityViolationError(prop);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly immutableDelegate: any;

  constructor(private readonly db: DatabaseService) {
    this.immutableDelegate = createImmutableAuditLogDelegate(
      this.db.client.auditLog,
    );
  }

  async log(data: {
    organizationId?: string | null;
    workspaceId?: string | null;
    actorUserId?: string | null;
    entityType: string;
    entityId: string;
    action: string;
    beforeJson?: any;
    afterJson?: any;
  }) {
    try {
      return await this.immutableDelegate.create({
        data: {
          organizationId: data.organizationId ?? null,
          workspaceId: data.workspaceId ?? null,
          actorUserId: data.actorUserId ?? null,
          entityType: data.entityType,
          entityId: data.entityId,
          action: data.action,
          beforeJson: data.beforeJson ?? undefined,
          afterJson: data.afterJson ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${data.entityType}:${data.entityId} action=${data.action}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  // WORM Enforcement: Prevent modifying log entries in the application layer
  async updateAuditLog() {
    throw new AuditLogImmutabilityViolationError('update');
  }

  async deleteAuditLog() {
    throw new AuditLogImmutabilityViolationError('delete');
  }

  /** Read-only accessors — safe, no mutation surface. */
  async findByEntity(entityType: string, entityId: string) {
    return this.immutableDelegate.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByWorkspace(workspaceId: string, limit = 100) {
    return this.immutableDelegate.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Calls the verify_audit_chain() Postgres function from the WORM
   * migration.
   */
  async verifyChainIntegrity(): Promise<{
    isValid: boolean;
    firstBrokenId: string | null;
    detail: string;
  }> {
    const [result] = await this.db.client.$queryRaw<
      Array<{
        is_valid: boolean;
        first_broken_id: string | null;
        detail: string;
      }>
    >(Prisma.sql`SELECT * FROM verify_audit_chain()`);

    if (!result.is_valid) {
      this.logger.error(
        `Audit chain integrity check FAILED at row ${result.first_broken_id}: ${result.detail}`,
      );
    }

    return {
      isValid: result.is_valid,
      firstBrokenId: result.first_broken_id,
      detail: result.detail,
    };
  }

  get readOnlyDelegate() {
    return this.immutableDelegate;
  }
}
