import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma } from '@atlas/database';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly client = prisma;

  async onModuleInit() {
    await this.client.$connect();

    // Deterministic policy veto CHECK constraint for investment_decisions
    try {
      const constraints = await this.client.$queryRawUnsafe<any[]>(
        `SELECT conname FROM pg_constraint WHERE conname = 'chk_policy_verdict';`,
      );
      if (constraints.length === 0) {
        try {
          await this.client.$executeRawUnsafe(
            `ALTER TABLE "investment_decisions" DROP CONSTRAINT IF EXISTS chk_policy_verdict;`,
          );
        } catch {
          /* ignore */
        }
        await this.client.$executeRawUnsafe(
          `ALTER TABLE "investment_decisions" ADD CONSTRAINT chk_policy_verdict CHECK (NOT (policy_verdict = 'Avoid' AND verdict <> 'Avoid'));`,
        );
      }
    } catch (err: any) {
      console.warn(
        'Could not enforce database-level policy veto constraint:',
        err.message,
      );
    }

    // WORM compliance triggers/rules for audit_logs table
    try {
      const rules = await this.client.$queryRawUnsafe<any[]>(
        `SELECT rulename, definition FROM pg_rules WHERE tablename = 'audit_logs';`,
      );
      const ruleMap = new Map<string, string>();
      for (const r of rules) {
        ruleMap.set(r.rulename.toLowerCase(), r.definition || '');
      }

      const updateDef = ruleMap.get('protect_audit_logs_update');
      const deleteDef = ruleMap.get('protect_audit_logs_delete');

      const needsUpdateRule =
        !updateDef || !updateDef.includes('pg_trigger_depth');
      const needsDeleteRule =
        !deleteDef || !deleteDef.includes('pg_trigger_depth');

      if (needsUpdateRule) {
        try {
          await this.client.$executeRawUnsafe(
            `DROP RULE IF EXISTS protect_audit_logs_update ON "audit_logs";`,
          );
        } catch {
          /* ignore */
        }
        try {
          await this.client.$executeRawUnsafe(
            `CREATE RULE protect_audit_logs_update AS ON UPDATE TO "audit_logs" WHERE (pg_trigger_depth() = 0) DO INSTEAD NOTHING;`,
          );
        } catch (err: any) {
          if (
            !err.message.includes('already exists') &&
            !err.message.includes('42710')
          ) {
            throw err;
          }
        }
      }

      if (needsDeleteRule) {
        try {
          await this.client.$executeRawUnsafe(
            `DROP RULE IF EXISTS protect_audit_logs_delete ON "audit_logs";`,
          );
        } catch {
          /* ignore */
        }
        try {
          await this.client.$executeRawUnsafe(
            `CREATE RULE protect_audit_logs_delete AS ON DELETE TO "audit_logs" WHERE (pg_trigger_depth() = 0) DO INSTEAD NOTHING;`,
          );
        } catch (err: any) {
          if (
            !err.message.includes('already exists') &&
            !err.message.includes('42710')
          ) {
            throw err;
          }
        }
      }
    } catch (err: any) {
      console.warn(
        'Could not enforce database-level WORM audit policies:',
        err.message,
      );
    }
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
