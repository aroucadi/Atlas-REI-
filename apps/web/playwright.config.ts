import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'npx next dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      cwd: './',
      timeout: 120000,
      env: {
        BACKEND_URL: 'http://localhost:3001/api/v1',
      },
    },
    {
      command: 'npm run dev --workspace=api',
      url: 'http://localhost:3001',
      reuseExistingServer: true,
      cwd: '../../',
      timeout: 120000,
      env: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/atlas_rei_test?schema=public',
        ALLOW_MOCK_GATEWAY: process.env.GEMINI_API_KEY ? 'false' : 'true',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        NODE_ENV: 'test',
        PORT: '3001',
        JWT_SECRET: 'super-secret-dev-jwt-key-atlas-rei',
      },
    },
  ],
  projects: [
    {
      name: 'system-chrome',
      use: {
        channel: 'chrome',
      },
    },
  ],
});
