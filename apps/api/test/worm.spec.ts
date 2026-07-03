import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../src/database/database.service';
import {
  AuditLogService,
  AuditLogImmutabilityViolationError,
} from '../src/database/audit-log.service';
import { Prisma } from '@prisma/client';

describe('WORM audit trail', () => {
  let module: TestingModule;
  let db: DatabaseService;
  let auditLogService: AuditLogService;

  let organizationId: string;
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [DatabaseService, AuditLogService],
    }).compile();

    db = module.get(DatabaseService);
    auditLogService = module.get(AuditLogService);

    // Seed minimal FK dependencies
    const org = await db.client.organization.create({
      data: { name: 'WORM Test Org', slug: `worm-test-${Date.now()}` },
    });
    organizationId = org.id;

    const user = await db.client.user.create({
      data: {
        email: `worm-test-${Date.now()}@atlas-rei.test`,
        fullName: 'WORM Test User',
        authProvider: 'test',
      },
    });
    userId = user.id;

    const workspace = await db.client.workspace.create({
      data: { organizationId, name: 'WORM Test Workspace' },
    });
    workspaceId = workspace.id;
  });

  afterAll(async () => {
    await db.client.$disconnect();
    await module.close();
  });

  // ---------------------------------------------------------------------------
  // 1. Hash chain correctness on insert
  // ---------------------------------------------------------------------------

  describe('hash chain on insert', () => {
    it('computes entryHash and links previousHash to the prior row', async () => {
      const first = await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-1',
        action: 'created',
        afterJson: { note: 'first row' },
      });

      const second = await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-1',
        action: 'updated',
        beforeJson: { note: 'first row' },
        afterJson: { note: 'second row' },
      });

      expect(first.entryHash).toBeDefined();
      expect(first.entryHash).toHaveLength(64); // sha256 hex digest length
      expect(second.previousHash).toBe(first.entryHash);
      expect(second.entryHash).not.toBe(first.entryHash);
    });

    it("chains a brand new row to the true latest row in the table, not just within this test's scope", async () => {
      const latestBeforeInsert = await db.client.$queryRaw<
        Array<{ entry_hash: string }>
      >(Prisma.sql`
        SELECT entry_hash FROM audit_logs
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `);

      const inserted = await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-2',
        action: 'created',
      });

      expect(inserted.previousHash).toBe(latestBeforeInsert[0].entry_hash);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Mutation/deletion is blocked at the DB level
  // ---------------------------------------------------------------------------

  describe('database-level immutability enforcement', () => {
    let targetRowId: string;

    beforeAll(async () => {
      const row = await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-immutable',
        action: 'created',
        afterJson: { note: 'do not touch' },
      });
      targetRowId = row.id;
    });

    it('rejects raw SQL UPDATE with a database exception or silently ignores it', async () => {
      const check = await db.client.auditLog.findUnique({
        where: { id: targetRowId },
      });
      console.log('DEBUG: targetRowId:', targetRowId, 'exists:', !!check);
      const promise = db.client.$executeRawUnsafe(
        `UPDATE audit_logs SET action = 'tampered' WHERE id = '${targetRowId}'::uuid`,
      );
      try {
        const affectedRows = await promise;
        expect(affectedRows).toBe(0);
      } catch (err: any) {
        expect(err.message).toMatch(
          /WORM|insufficient_privilege|not permitted|cannot perform/i,
        );
      }
    });

    it('rejects raw SQL DELETE with a database exception or silently ignores it', async () => {
      const promise = db.client.$executeRawUnsafe(
        `DELETE FROM audit_logs WHERE id = '${targetRowId}'::uuid`,
      );
      try {
        const affectedRows = await promise;
        expect(affectedRows).toBe(0);
      } catch (err: any) {
        expect(err.message).toMatch(
          /WORM|insufficient_privilege|not permitted|cannot perform/i,
        );
      }
    });

    it('rejects Prisma .update() on the raw delegate (bypassing AuditLogService)', async () => {
      await expect(
        db.client.auditLog.update({
          where: { id: targetRowId },
          data: { action: 'tampered' },
        }),
      ).rejects.toThrow();
    });

    it('rejects Prisma .delete() on the raw delegate (bypassing AuditLogService)', async () => {
      await expect(
        db.client.auditLog.delete({ where: { id: targetRowId } }),
      ).rejects.toThrow();
    });

    it('AuditLogService.readOnlyDelegate throws BEFORE reaching Prisma at all', async () => {
      expect(() =>
        auditLogService.readOnlyDelegate.update({
          where: { id: targetRowId },
          data: { action: 'tampered' },
        }),
      ).toThrow(AuditLogImmutabilityViolationError);
    });

    it('confirms the row was not actually modified after all rejected attempts', async () => {
      const row = await db.client.auditLog.findUnique({
        where: { id: targetRowId },
      });
      expect(row?.action).toBe('created');
      expect((row?.afterJson as any)?.note).toBe('do not touch');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Chain integrity verification detects tampering
  // ---------------------------------------------------------------------------

  describe('verifyChainIntegrity', () => {
    it('returns isValid: true on an untampered chain', async () => {
      await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-clean-1',
        action: 'created',
      });
      await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-clean-2',
        action: 'created',
      });

      const result = await auditLogService.verifyChainIntegrity();
      expect(result.isValid).toBe(true);
      expect(result.firstBrokenId).toBeNull();
    });

    it('detects a broken chain if a row is mutated by direct DB access outside the trigger path', async () => {
      const canRunSuperuserTest = !!process.env.WORM_TEST_SUPERUSER_URL;
      if (!canRunSuperuserTest) {
        console.warn(
          'Skipping DISABLE TRIGGER tampering test: WORM_TEST_SUPERUSER_URL not defined',
        );
        return;
      }

      const row = await auditLogService.log({
        organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'test_entity',
        entityId: 'entity-to-tamper',
        action: 'created',
        afterJson: { note: 'original' },
      });

      // Connect using the superuser connection string to disable triggers
      const superuserDb = new DatabaseService();
      // Temporarily override the client URL config
      (superuserDb.client as any)._customUrl =
        process.env.WORM_TEST_SUPERUSER_URL;

      await superuserDb.client
        .$executeRaw`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_block_update`;
      try {
        await superuserDb.client.$executeRaw`
          UPDATE audit_logs
          SET after_json = '{"note": "tampered"}'::jsonb
          WHERE id = ${row.id}::uuid
        `;
      } finally {
        await superuserDb.client
          .$executeRaw`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_block_update`;
        await superuserDb.client.$disconnect();
      }

      const result = await auditLogService.verifyChainIntegrity();
      expect(result.isValid).toBe(false);
      expect(result.detail).toMatch(
        /entry_hash does not match|previous_hash mismatch/,
      );
    });
  });
});
