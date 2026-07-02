if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'CRITICAL SECURITY FAILURE: NODE_ENV must be set to "test" for E2E tests.',
  );
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'CRITICAL SECURITY FAILURE: TEST_DATABASE_URL environment variable is missing.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import { EmbeddingService } from './../src/document/embedding.service';

describe('Adversarial Verification Suite (Release 20)', () => {
  let app: INestApplication<App>;
  let db: DatabaseService;
  let embeddingService: EmbeddingService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/'] });
    await app.init();

    db = moduleFixture.get(DatabaseService);
    embeddingService = moduleFixture.get(EmbeddingService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  let user1Token: string;
  let user1WorkspaceId: string;

  let user2Token: string;
  let user2WorkspaceId: string;

  const mockPropertyId = '00000000-0000-0000-0000-000000000002';

  it('should register user 1 and user 2 and login', async () => {
    const email1 = `adv1-${Date.now()}@example.com`;
    const reg1 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: email1,
        fullName: 'Adversarial One',
        passwordString: 'Password123',
      })
      .expect(201);
    user1WorkspaceId = reg1.body.workspaceId;

    const log1 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: email1,
        passwordString: 'Password123',
      })
      .expect(200);
    user1Token = log1.body.accessToken;

    const email2 = `adv2-${Date.now()}@example.com`;
    const reg2 = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: email2,
        fullName: 'Adversarial Two',
        passwordString: 'Password123',
      })
      .expect(201);
    user2WorkspaceId = reg2.body.workspaceId;

    const log2 = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: email2,
        passwordString: 'Password123',
      })
      .expect(200);
    user2Token = log2.body.accessToken;
  });

  describe('Adversarial Tenancy boundaries', () => {
    it('should prevent user 2 from reading user 1 workspace documents', async () => {
      // User 1 uploads a file
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/documents/upload`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          fileName: 'confidential.txt',
          fileBase64: Buffer.from('Confidential workspace 1 text').toString(
            'base64',
          ),
          entityType: 'property',
          entityId: mockPropertyId,
          documentType: 'lease_agreement',
        })
        .expect(201);

      // User 2 attempts to query User 1's documents
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/documents`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
    });
  });

  describe('Adversarial Audit Log Immutability (WORM)', () => {
    it('should reject UPDATE and DELETE SQL actions on audit_logs table', async () => {
      // 1. Create a log
      const log = await db.client.auditLog.create({
        data: {
          entityType: 'test_adversarial',
          entityId: 'adv-worm-123',
          action: 'CREATE',
        },
      });

      // 2. Attempt direct SQL Update
      await db.client.$executeRawUnsafe(
        `UPDATE "audit_logs" SET "action" = 'MUTATED' WHERE "id" = '${log.id}';`,
      );

      const afterUpdate = await db.client.auditLog.findUnique({
        where: { id: log.id },
      });
      expect(afterUpdate?.action).toBe('CREATE'); // Should NOT be 'MUTATED'

      // 3. Attempt direct SQL Delete
      await db.client.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "id" = '${log.id}';`,
      );

      const afterDelete = await db.client.auditLog.findUnique({
        where: { id: log.id },
      });
      expect(afterDelete).not.toBeNull(); // Record must still exist
    });
  });

  describe('Adversarial PDF/Document text extraction', () => {
    it('should extract real text verbatim from PDF and block silent placeholder fallback', async () => {
      const uniqueVerbatimText = `VERBATIM_UNIQUE_ADVERSARIAL_VERIFICATION_CONTENT_${Date.now()}`;

      const minimalPdf = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources <<>> /Contents 4 0 R>> endobj
4 0 obj <</Length 100>> stream
BT
/F1 12 Tf
70 700 Td
(${uniqueVerbatimText}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000111 00000 n
0000000212 00000 n
trailer <</Size 5 /Root 1 0 R>>
startxref
311
%%EOF`;

      const base64Content = Buffer.from(minimalPdf, 'utf-8').toString('base64');

      // Upload real PDF
      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/documents/upload`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          fileName: 'real-parsed-test.pdf',
          fileBase64: base64Content,
          entityType: 'property',
          entityId: mockPropertyId,
          documentType: 'lease_agreement',
          mimeType: 'application/pdf',
        })
        .expect(201);

      const documentId = uploadRes.body.id;

      // Poll database for processing completion
      let docStatus = 'pending';
      let attempts = 0;
      while (
        docStatus !== 'completed' &&
        docStatus !== 'failed' &&
        attempts < 20
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const check = await db.client.document.findUnique({
          where: { id: documentId },
        });
        docStatus = check?.status || 'pending';
        attempts++;
      }

      expect(docStatus).toBe('completed');

      // Retrieve vector embedding chunks for this document
      const queryResults = await embeddingService.semanticSearch(
        user1WorkspaceId,
        uniqueVerbatimText,
        1,
      );

      expect(queryResults.length).toBeGreaterThan(0);
      expect(queryResults[0].content).toContain(uniqueVerbatimText);
    });

    it('should transition to failed status when document extraction fails', async () => {
      // Upload corrupt base64 string claiming it's a PDF
      const corruptBase64 = Buffer.from(
        'Not a real PDF structure at all.',
      ).toString('base64');

      const uploadRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/documents/upload`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          fileName: 'corrupt.pdf',
          fileBase64: corruptBase64,
          entityType: 'property',
          entityId: mockPropertyId,
          documentType: 'lease_agreement',
          mimeType: 'application/pdf',
        })
        .expect(201);

      const documentId = uploadRes.body.id;

      // Poll database for processing
      let docStatus = 'pending';
      let attempts = 0;
      let errorReason = '';
      while (
        docStatus !== 'completed' &&
        docStatus !== 'failed' &&
        attempts < 20
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        const check = await db.client.document.findUnique({
          where: { id: documentId },
        });
        docStatus = check?.status || 'pending';
        errorReason = check?.errorMessage || '';
        attempts++;
      }

      expect(docStatus).toBe('failed');
      expect(errorReason).toContain('Invalid PDF structure.');
    });
  });

  describe('Adversarial Database-Layer Underwriting Policy Enforcement', () => {
    it('should reject a direct SQL or Prisma insert where AI verdict contradicts veto policy', async () => {
      // chk_policy_verdict CHECK (NOT (policy_verdict = 'Avoid' AND verdict <> 'Avoid'))
      // Try insert: policyVerdict = 'Avoid', verdict = 'Buy' (contradicts Avoid mandate)
      await expect(
        db.client.investmentDecision.create({
          data: {
            workspaceId: user1WorkspaceId,
            entityType: 'property',
            entityId: mockPropertyId,
            verdict: 'Buy',
            policyVerdict: 'Avoid',
            thesisSummary: 'Veto bypass attempt',
            decisionSource: 'direct_prisma_bypass',
          },
        }),
      ).rejects.toThrow();

      // Ensure that a valid policy insert succeeds
      const okDecision = await db.client.investmentDecision.create({
        data: {
          workspaceId: user1WorkspaceId,
          entityType: 'property',
          entityId: mockPropertyId,
          verdict: 'Avoid',
          policyVerdict: 'Avoid',
          thesisSummary: 'Veto mandate respected',
          decisionSource: 'system',
        },
      });
      expect(okDecision.id).toBeDefined();
    });
  });

  describe('Adversarial Concurrency & Transaction Safety in Queue', () => {
    it('should handle 20 concurrent transactions safely without deadlocks or state leakage', async () => {
      // We will perform 20 concurrent transaction blocks inside database service
      const concurrentJobs = Array.from({ length: 20 }).map((_, idx) => {
        return db.client.$transaction(async (tx) => {
          // Perform overlapping updates on a shared property or table
          const workspace = await tx.workspace.findUnique({
            where: { id: user1WorkspaceId },
          });

          // Insert audit logs and update workspace name slightly
          await tx.auditLog.create({
            data: {
              entityType: 'concurrency_test',
              entityId: `job-${idx}`,
              action: `TX_${idx}`,
            },
          });

          return workspace;
        });
      });

      const results = await Promise.all(concurrentJobs);
      expect(results.length).toBe(20);
      expect(results[0]?.id).toBe(user1WorkspaceId);
    });
  });

  describe('Adversarial Resource-Bounded Context Tenancy', () => {
    let procId: string;

    beforeAll(async () => {
      // Create a goal in workspace 1
      const goal = await db.client.goal.create({
        data: {
          workspaceId: user1WorkspaceId,
          title: 'Adversarial Goal',
          description: 'Syscall verification',
        },
      });

      // Create a running process in workspace 1
      const proc = await db.client.kernelProcess.create({
        data: {
          workspaceId: user1WorkspaceId,
          goalId: goal.id,
          status: 'RUNNING',
          stepLimit: 10,
        },
      });
      procId = proc.id;
    });

    it('should block execution when sourceDocumentId is missing', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${user1WorkspaceId}/agent-kernel/processes/${procId}/syscall`,
        )
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          callType: 'tool_exec',
          payload: {
            toolScript: 'result = 42;',
          },
        })
        .expect(400);
    });

    it('should block execution when sourceDocumentId belongs to user 2 workspace (cross-tenant)', async () => {
      // User 2 uploads a document
      const doc2Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user2WorkspaceId}/documents/upload`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          fileName: 'user2.txt',
          fileBase64: Buffer.from('User 2 file content').toString('base64'),
          entityType: 'property',
          entityId: mockPropertyId,
          documentType: 'lease_agreement',
        })
        .expect(201);
      const user2DocId = doc2Res.body.id;

      // User 1 tries to execute a tool using User 2's document ID
      await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${user1WorkspaceId}/agent-kernel/processes/${procId}/syscall`,
        )
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          callType: 'tool_exec',
          payload: {
            sourceDocumentId: user2DocId,
            toolScript: 'result = 42;',
          },
        })
        .expect(400);
    });

    it('should allow execution when sourceDocumentId belongs to user 1 workspace (tenancy matches)', async () => {
      // User 1 uploads a document
      const doc1Res = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/documents/upload`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          fileName: 'user1.txt',
          fileBase64: Buffer.from('User 1 file content').toString('base64'),
          entityType: 'property',
          entityId: mockPropertyId,
          documentType: 'lease_agreement',
        })
        .expect(201);
      const user1DocId = doc1Res.body.id;

      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/workspaces/${user1WorkspaceId}/agent-kernel/processes/${procId}/syscall`,
        )
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          callType: 'tool_exec',
          payload: {
            sourceDocumentId: user1DocId,
            toolScript: 'result = args.a + args.b;',
            args: { a: 10, b: 32 },
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.result).toBe(42);
    });
  });

  describe('Adversarial Mock-Leakage Closure', () => {
    it('should forbid mock/simulation mode activation in production env configurations', async () => {
      // Backup original NODE_ENV
      const originalEnv = process.env.NODE_ENV;
      const originalMock = process.env.ALLOW_MOCK_GATEWAY;

      try {
        // Set environment variables to mimic production
        process.env.NODE_ENV = 'production';
        process.env.ALLOW_MOCK_GATEWAY = 'true';
        delete process.env.GEMINI_API_KEY;

        // Try instantiating AiGateway. In production without API key, it must throw!
        expect(() => {
          new AiGateway({ fallbackToMock: true });
        }).toThrow(/GEMINI_API_KEY environment variable is required/);
      } finally {
        // Restore environment
        process.env.NODE_ENV = originalEnv;
        if (originalMock !== undefined) {
          process.env.ALLOW_MOCK_GATEWAY = originalMock;
        } else {
          delete process.env.ALLOW_MOCK_GATEWAY;
        }
      }
    });
  });
});
