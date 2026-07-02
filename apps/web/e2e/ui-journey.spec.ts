import { test, expect } from '@playwright/test';

test.describe('Atlas REI UI E2E Journey Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept all BFF API requests and provide static mock responses using robust wildcard patterns
    await page.route('**/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user-123',
          email: 'investor@atlasrei.com',
          fullName: 'Test Investor',
          memberships: [
            {
              id: 'membership-1',
              organizationId: 'org-1',
              role: 'admin',
              organization: { id: 'org-1', name: 'Atlas Org' },
            },
          ],
        }),
      });
    });

    await page.route('**/auth/login', async (route) => {
      // Set the HTTP cookie so Edge middleware passes auth checks
      await page.context().addCookies([
        {
          name: 'atlas_token',
          value: 'test-token-jwt',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'user-123',
          accessToken: 'test-token-jwt',
          workspaceId: 'ws-1',
        }),
      });
    });

    await page.route('**/auth/register', async (route) => {
      await page.context().addCookies([
        {
          name: 'atlas_token',
          value: 'test-token-jwt',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'user-123',
          accessToken: 'test-token-jwt',
          workspaceId: 'ws-1',
        }),
      });
    });

    await page.route('**/workspaces', async (route) => {
      // Avoid matching other endpoints containing /workspaces/
      if (route.request().url().endsWith('/workspaces')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'ws-1', name: 'Workspace Alpha', organizationId: 'org-1' },
            { id: 'ws-2', name: 'Workspace Beta', organizationId: 'org-1' },
          ]),
        });
      } else {
        await route.continue();
      }
    });

    // Mock profiles for ws-1 and ws-2
    await page.route('**/profiles', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'prof-1',
            name: 'Dubai Yield Hunt',
            baseCurrency: 'AED',
            capitalAvailable: 10000000,
            riskTolerance: 'aggressive',
            targetCountriesJson: ['AE'],
          },
        ]),
      });
    });

    // Mock documents
    await page.route('**/documents', async (route) => {
      const url = route.request().url();
      if (url.includes('/ws-1/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'doc-alpha-1',
              workspaceId: 'ws-1',
              fileName: 'alpha-lease.pdf',
              documentType: 'lease_agreement',
              status: 'completed',
              storagePath: '/docs/alpha-lease.pdf',
              entityType: 'property',
              entityId: 'prop-1',
              mimeType: 'application/pdf',
              extractions: [],
              chunks: [],
            },
          ]),
        });
      } else if (url.includes('/ws-2/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'doc-beta-1',
              workspaceId: 'ws-2',
              fileName: 'beta-lease.pdf',
              documentType: 'lease_agreement',
              status: 'completed',
              storagePath: '/docs/beta-lease.pdf',
              entityType: 'property',
              entityId: 'prop-2',
              mimeType: 'application/pdf',
              extractions: [],
              chunks: [],
            },
          ]),
        });
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    });

    // Mock document upload
    await page.route('**/upload', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'doc-new-123',
          fileName: 'new_lease.pdf',
          status: 'completed',
        }),
      });
    });

    // Mock copilot chat
    await page.route('**/copilot/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          answer: 'Grounded answer: Workspace Alpha has 1 completed document.',
          toolsUsed: [
            {
              name: 'db_read',
              description: 'Fetch documents from DB',
              resultSummary: 'Found alpha-lease.pdf successfully',
            },
          ],
          suggestedActions: [
            {
              label: 'Review alpha-lease.pdf assumptions',
              action: 'summarize alpha-lease.pdf',
            },
          ],
        }),
      });
    });

    // Mock deals
    await page.route('**/deals', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock daily brief
    await page.route('**/daily-brief*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null),
      });
    });

    // Mock events
    await page.route('**/events', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock portfolios
    await page.route('**/portfolios', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock shortlists
    await page.route('**/shortlists', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock evidence
    await page.route('**/evidence*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Mock agent analytics
    await page.route('**/agent-analytics*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalRuns: 0,
          completionRate: 0,
          averageLatencyMs: 0,
          cumulativeCost: 0,
          failureHotspots: [],
        }),
      });
    });

    // Mock definitions and jobs
    await page.route('**/agent/definitions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/tool/definitions*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/jobs*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
  });

  test('should execute full login -> navigate -> upload -> copilot -> workspace switch flow', async ({ page }) => {
    // 1. Visit login page
    await page.goto('/login');
    await expect(page.locator('text=ATLAS')).toBeVisible();

    // Fill in credentials
    await page.fill('#email', 'investor@atlasrei.com');
    await page.fill('#password', 'Password123');

    // Submit form
    await page.click('button[type="submit"]');

    // 2. Redirect to /home and check dashboard layout
    await expect(page).toHaveURL(/\/home/);
    await expect(page.locator('text=INVESTOR TERMINAL')).toBeVisible();
    await expect(page.locator('#workspaceSelect')).toBeVisible();

    // Check default workspace value
    const defaultWs = await page.locator('#workspaceSelect').inputValue();
    expect(defaultWs).toBe('ws-1');

    // 3. Navigate to Documents page and verify Document Manager content
    await page.click('text=Documents');
    await expect(page).toHaveURL(/\/documents/);
    await expect(page.locator('h1:has-text("DOCUMENT MANAGER")')).toBeVisible();

    // Verify workspace alpha document is listed
    await expect(page.locator('text=alpha-lease.pdf')).toBeVisible();
    await expect(page.locator('text=beta-lease.pdf')).not.toBeVisible();

    // 4. Test workspace switching: switch to Workspace Beta
    await page.selectOption('#workspaceSelect', 'ws-2');

    // Verify visual state was updated (Workspace Beta document appears, Workspace Alpha document disappears)
    await expect(page.locator('text=beta-lease.pdf')).toBeVisible();
    await expect(page.locator('text=alpha-lease.pdf')).not.toBeVisible();

    // Switch back to Workspace Alpha for remaining steps
    await page.selectOption('#workspaceSelect', 'ws-1');
    await expect(page.locator('text=alpha-lease.pdf')).toBeVisible();

    // 5. Test Document Ingestion/Upload UI flow
    await page.setInputFiles('#fileIngestionInput', {
      name: 'new_lease.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 ... dummy content ...'),
    });
    // Set up intercept post-upload document refresh mock
    await page.route('**/documents', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'doc-alpha-1',
            workspaceId: 'ws-1',
            fileName: 'alpha-lease.pdf',
            documentType: 'lease_agreement',
            status: 'completed',
          },
          {
            id: 'doc-new-123',
            workspaceId: 'ws-1',
            fileName: 'new_lease.pdf',
            documentType: 'lease_agreement',
            status: 'completed',
          },
        ]),
      });
    });

    await page.click('button:has-text("Upload Document")');

    // Verify new document appears in list
    await expect(page.locator('text=new_lease.pdf')).toBeVisible();

    // 6. Test Copilot interaction
    await page.click('text=Analyst Copilot');
    // Use exact match to avoid matching description text
    await expect(page.getByText('AI Analyst Copilot', { exact: true })).toBeVisible();

    // Use input selector instead of textarea
    await page.fill('input[placeholder="Ask copilot..."]', 'Summarize Workspace Alpha');
    
    // Use unambiguous button[aria-label="Send message"] to avoid clicking close or trigger buttons
    await page.click('button[aria-label="Send message"]');

    // Verify response is rendered
    await expect(page.locator('text=Grounded answer: Workspace Alpha has 1 completed document.')).toBeVisible();

    // Verify tool executions are visible
    await expect(page.locator('text=tool executions (1)')).toBeVisible();
    await page.click('text=tool executions (1)');
    await expect(page.locator('text=Fetch documents from DB')).toBeVisible();
  });
});
