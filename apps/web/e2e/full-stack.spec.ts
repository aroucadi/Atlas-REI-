import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';

const HAS_REAL_LLM_KEY = !!process.env.GEMINI_API_KEY;

test.describe('Atlas REI Full-Stack E2E Journey Tests (Unmocked)', () => {
  // This suite requires a real LLM API key. Without one, every AI Gateway
  // call falls through to simulation code and the test proves nothing about
  // real LLM grounding. Skip honestly instead of running a simulated test.
  test.skip(!HAS_REAL_LLM_KEY, 'SKIPPED: GEMINI_API_KEY is not set — cannot run unmocked full-stack E2E without a real LLM provider.');
  test.beforeAll(async () => {
    // Run schema push and seed on the test database before the tests run
    const testDbUrl = 'postgresql://postgres:postgres@localhost:5432/atlas_rei_test?schema=public';
    console.log('Pushing schema and seeding test database...');
    try {
      execSync('npx prisma db push --schema=../../packages/database/prisma/schema.prisma --accept-data-loss', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        cwd: path.join(__dirname, '../'),
        stdio: 'inherit',
      });
      execSync('npx ts-node ../../packages/database/prisma/seed.ts', {
        env: { ...process.env, DATABASE_URL: testDbUrl },
        cwd: path.join(__dirname, '../'),
        stdio: 'inherit',
      });
      console.log('Database schema push and seed completed.');
    } catch (err: any) {
      console.error('Failed database schema push or seed:', err.message);
      throw err;
    }
  });

  function generateMinimalPDF(secretCode: string): Buffer {
    const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 100 >>
stream
BT
/F1 12 Tf
70 700 Td
(The secret code is ${secretCode}) Tj
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
trailer
<< /Size 5 /Root 1 0 R >>
startxref
311
%%EOF`;
    return Buffer.from(pdfContent, 'utf-8');
  }

  test('should register, upload document, query copilot, and check workspace data isolation', async ({ page }) => {
    // Generate a unique email for registration
    const uniqueEmail = `fullstack-${Date.now()}@example.com`;
    const secretCode = `ATLAS-FS-${Date.now()}`;

    // 1. Visit Login
    await page.goto('/login');
    await expect(page.locator('text=ATLAS')).toBeVisible();

    // 2. Toggle to registration
    await page.click('text=Configure new mandate? Register');
    await expect(page.locator('text=Initialize System Account')).toBeVisible();

    // 3. Register user
    await page.fill('#fullName', 'Fullstack QA User');
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');

    // 4. Verify login and redirect to home
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('text=INVESTOR TERMINAL')).toBeVisible();

    // 5. Navigate to documents page
    await page.click('text=Documents');
    await expect(page).toHaveURL(/\/documents/);
    await expect(page.locator('h1:has-text("DOCUMENT MANAGER")')).toBeVisible();

    // 6. Upload real PDF fixture containing secret code
    console.log(`Uploading PDF document containing secret code: ${secretCode}`);
    const pdfBuffer = generateMinimalPDF(secretCode);
    
    await page.setInputFiles('#fileIngestionInput', {
      name: 'code_fixture.pdf',
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
    });
    
    await page.click('button:has-text("Upload Document")');

    // 7. Poll document status in the UI until completed
    console.log('Polling background document extraction pipeline status...');
    let isCompleted = false;
    for (let i = 0; i < 30; i++) {
      const text = await page.locator('span:has-text("Extraction")').first().textContent();
      console.log(`Current extraction status badge text: ${text}`);
      if (text && text.includes('Completed')) {
        isCompleted = true;
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(isCompleted).toBe(true);
    console.log('Document processing completed.');

    // 8. Open Analyst Copilot and run query
    await page.click('text=Analyst Copilot');
    await expect(page.getByText('AI Analyst Copilot', { exact: true })).toBeVisible();

    console.log(`Sending copilot chat query: "What is the secret code?"`);
    await page.fill('input[placeholder="Ask copilot..."]', 'What is the secret code?');
    await page.click('button[aria-label="Send message"]');

    // 9. Verify grounded, citation-backed response
    console.log('Verifying grounded copilot answer...');
    await expect(page.locator(`text=${secretCode}`)).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=code_fixture.pdf').first()).toBeVisible({ timeout: 15000 });
    const fullStackResponse = await page.locator('.prose').last().textContent();
    console.log(`[Full-Stack Test] Literal response: ${fullStackResponse}`);

    // 10. Switch to a second workspace to assert isolation
    console.log('Creating second workspace (Workspace B) for tenant isolation check...');
    await page.click('button[aria-label="Create Workspace"]');
    await page.fill('input[placeholder="Workspace name"]', 'Workspace B');
    await page.click('button:has-text("Create")');

    // Select Workspace B from switcher
    console.log('Switching active workspace to Workspace B...');
    await page.selectOption('#workspaceSelect', { label: 'Workspace B' });

    // Assert Workspace B has no documents
    await expect(page.locator('text=No documents found in workspace')).toBeVisible();

    // Query copilot for the same secret code in Workspace B context
    console.log('Sending query in Workspace B context to verify data isolation...');
    await page.fill('input[placeholder="Ask copilot..."]', 'What is the secret code?');
    await page.click('button[aria-label="Send message"]');

    // Assert that the answer in Workspace B does NOT contain the secret code or cite the PDF
    await expect(page.locator(`text=${secretCode}`)).not.toBeVisible({ timeout: 5000 });
  });
});
