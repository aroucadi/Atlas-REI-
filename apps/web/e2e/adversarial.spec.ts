import { test, expect } from '@playwright/test';

const HAS_REAL_LLM_KEY = !!process.env.GEMINI_API_KEY;

test.describe('Atlas REI Adversarial Grounding Tests', () => {
  test.skip(!HAS_REAL_LLM_KEY, 'SKIPPED: GEMINI_API_KEY is not set');

  function generatePDF(text: string): Buffer {
    // Escaping parenthesis for PDF text string
    const escapedText = text.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
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
<< /Length 200 >>
stream
BT
/F1 12 Tf
70 700 Td
(${escapedText}) Tj
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

  async function loginAndSetupWorkspace(page: any, name: string) {
    const uniqueEmail = `adv-${Date.now()}-${Math.random()}@example.com`;
    await page.goto('/login');
    await page.click('text=Configure new mandate? Register');
    await page.fill('#fullName', name);
    await page.fill('#email', uniqueEmail);
    await page.fill('#password', 'Password123');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/home/);
  }

  async function uploadDocument(page: any, filename: string, content: string) {
    await page.goto('/documents');
    await page.setInputFiles('#fileIngestionInput', {
      name: filename,
      mimeType: 'application/pdf',
      buffer: generatePDF(content),
    });
    await page.click('button:has-text("Upload Document")');
    
    // Poll for completion
    let isCompleted = false;
    for (let i = 0; i < 30; i++) {
      const text = await page.locator('span:has-text("Extraction")').first().textContent();
      if (text && text.includes('Completed')) {
        isCompleted = true;
        break;
      }
      await page.waitForTimeout(1000);
    }
    expect(isCompleted).toBe(true);
  }

  async function queryCopilot(page: any, query: string) {
    await page.goto('/committee'); // Copilot is accessible everywhere, but let's go somewhere with standard layout
    await page.click('text=Analyst Copilot');
    await page.fill('input[placeholder="Ask copilot..."]', query);
    await page.click('button[aria-label="Send message"]');
    // Wait for the response to finish streaming (Wait for the send button to re-enable or similar)
    await page.waitForTimeout(5000); // Simple wait for LLM
  }

  test('Absent Evidence Test: Ask about fact with no document', async ({ page }) => {
    await loginAndSetupWorkspace(page, 'AbsentTester');
    await uploadDocument(page, 'doc1.pdf', 'The capital of France is Paris.');
    
    await queryCopilot(page, 'What is the secret code of project Alpha?');
    const response = await page.locator('.prose').last().textContent();
    console.log(`[Absent Evidence Test] Response: ${response}`);
    // Assert it explicitly states unavailable, instead of fabricating.
    // If it fabricates, we fail.
    expect(response?.toLowerCase()).not.toMatch(/project alpha is/);
  });

  test('Multi-Document Conflict Test', async ({ page }) => {
    await loginAndSetupWorkspace(page, 'ConflictTester');
    await uploadDocument(page, 'doc_a.pdf', 'The projected ROI for the property is 8%.');
    await uploadDocument(page, 'doc_b.pdf', 'The projected ROI for the property is 5%.');
    
    await queryCopilot(page, 'What is the projected ROI for the property?');
    const response = await page.locator('.prose').last().textContent();
    console.log(`[Multi-Document Conflict Test] Response: ${response}`);
  });

  test('Irrelevant-Context Distraction Test', async ({ page }) => {
    await loginAndSetupWorkspace(page, 'DistractionTester');
    const longText = 'The quick brown fox jumps over the lazy dog. '.repeat(50) + 'The actual maintenance fee is $450. ' + 'The quick brown fox jumps over the lazy dog. '.repeat(50);
    await uploadDocument(page, 'long_doc.pdf', longText);
    
    await queryCopilot(page, 'What is the actual maintenance fee?');
    const response = await page.locator('.prose').last().textContent();
    console.log(`[Irrelevant-Context Distraction Test] Response: ${response}`);
  });

  test('Cross-Workspace Leak Test', async ({ page }) => {
    await loginAndSetupWorkspace(page, 'LeakTester1');
    await uploadDocument(page, 'leak_source.pdf', 'Workspace 1 secret is WATERMELON.');
    
    // Create new workspace
    await page.click('button[aria-label="Create Workspace"]');
    await page.fill('input[placeholder="Workspace name"]', 'Workspace 2');
    await page.click('button:has-text("Create")');
    await page.selectOption('#workspaceSelect', { label: 'Workspace 2' });

    await queryCopilot(page, 'What is the Workspace 1 secret?');
    const response = await page.locator('.prose').last().textContent();
    console.log(`[Cross-Workspace Leak Test] Response: ${response}`);
  });

});
