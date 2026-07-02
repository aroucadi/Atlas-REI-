// apps/api/src/audit/audit-log.service.ts
//
// This is the ONLY sanctioned way to touch the audit_logs table from
// application code. The DB triggers from the WORM migration are the real
// enforcement layer (a raw prisma.$executeRaw or a bug elsewhere in the
// codebase can't get around them), but a raw Postgres exception surfacing
// through an unrelated code path is a miserable debugging experience.
// This service exists to fail fast, with a legible error, at the point of
// misuse — and to be the single grep target ("AuditLogService") that shows
// up in code review whenever anyone touches audit history.
//
// Enforcement has two layers:
//   1. AuditLogService only exposes `record()` (create) and read methods —
//      there is no update/delete method to call in the first place.
//   2. A Proxy-wrapped Prisma delegate throws immediately if anything
//      (including future code that bypasses this service and reaches for
//      `this.prisma.auditLog` directly) calls .update, .updateMany,
//      .delete, .deleteMany, or .upsert.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Thrown whenever application code attempts to mutate or delete an
 * audit_logs row. This should never be caught and silently swallowed —
 * if you're catching this, the fix is to remove the call, not handle
 * the exception.
 */
export class AuditLogImmutabilityViolationError extends Error {
  constructor(operation: string) {
    super(
      `Blocked attempt to call "${operation}" on audit_logs. ` +
        `audit_logs is a WORM (write-once-read-many) table — see the ` +
        `worm_audit_trail migration. Only AuditLogService.record() is ` +
        `permitted. If you believe you have a legitimate need to modify ` +
        `audit history, that need is almost certainly wrong; escalate to ` +
        `eng leadership rather than working around this.`,
    );
    this.name = 'AuditLogImmutabilityViolationError';
  }
}

const BLOCKED_OPERATIONS = new Set([
  'update',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert',
]);

/**
 * Wraps prisma.auditLog in a Proxy that throws on any mutation/deletion
 * method before the call ever reaches Prisma (and thus before it would
 * hit the DB trigger and throw there instead — this is strictly an
 * earlier, friendlier failure point, not a replacement for the trigger).
 */
function createImmutableAuditLogDelegate(
  delegate: Prisma.AuditLogDelegate,
): Prisma.AuditLogDelegate {
  return new Proxy(delegate, {
    get(target, prop: string, receiver) {
      if (BLOCKED_OPERATIONS.has(prop)) {
        throw new AuditLogImmutabilityViolationError(prop);
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

export interface RecordAuditLogInput {
  organizationId?: string | null;
  workspaceId?: string | null;
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  private readonly immutableDelegate: Prisma.AuditLogDelegate;

  constructor(private readonly prisma: PrismaService) {
    this.immutableDelegate = createImmutableAuditLogDelegate(
      this.prisma.auditLog,
    );
  }

  /**
   * The only write path into audit_logs. Insert-only, matching the DB
   * trigger's enforcement — previous_hash / entry_hash are computed by
   * the trigger, not here, so callers never need to think about the chain.
   */
  async record(input: RecordAuditLogInput) {
    try {
      return await this.prisma.auditLog.create({
        data: {
          organizationId: input.organizationId ?? null,
          workspaceId: input.workspaceId ?? null,
          actorUserId: input.actorUserId ?? null,
          entityType: input.entityType,
          entityId: input.entityId,
          action: input.action,
          beforeJson: input.beforeJson ?? undefined,
          afterJson: input.afterJson ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${input.entityType}:${input.entityId} action=${input.action}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /** Read-only accessors — safe, no mutation surface. */
  async findByEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findByWorkspace(workspaceId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Calls the verify_audit_chain() Postgres function from the WORM
   * migration. Wire this into a scheduled job (e.g. nightly) and/or a
   * compliance-facing admin endpoint — this is your "prove nothing was
   * tampered with" button for auditors and enterprise prospects.
   */
  async verifyChainIntegrity(): Promise<{
    isValid: boolean;
    firstBrokenId: string | null;
    detail: string;
  }> {
    const [result] = await this.prisma.$queryRaw<
      Array<{ is_valid: boolean; first_broken_id: string | null; detail: string }>
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

  /**
   * Exposed deliberately so other services CANNOT reach the real,
   * unwrapped `prisma.auditLog` delegate through this service. Any code
   * that needs audit log access should inject AuditLogService, not
   * PrismaService, when the target is audit_logs specifically.
   */
  get readOnlyDelegate(): Prisma.AuditLogDelegate {
    return this.immutableDelegate;
  }
}

// -----------------------------------------------------------------------------
// Optional: a lint rule / code review guard, since Proxy enforcement only
// catches misuse at runtime. Add to your ESLint config to catch it at
// authoring time too:
//
// // .eslintrc.js
// rules: {
//   'no-restricted-syntax': [
//     'error',
//     {
//       selector:
//         "CallExpression[callee.object.property.name='auditLog'][callee.property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]",
//       message:
//         'Direct mutation of prisma.auditLog is forbidden. Use AuditLogService.record() (create-only) instead.',
//     },
//   ],
// }
// -----------------------------------------------------------------------------
