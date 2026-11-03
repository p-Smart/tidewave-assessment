import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * One shared, stateful stack (engine, FakePay, leads, n8n, Mailpit) => one worker, files in order.
 * Every spec file starts from `resetAll()` (see fixtures.ts).
 *
 * Known-defect tests assert the CORRECT behaviour and are marked with knownDefect('<ticket>'):
 *   npx playwright test                      -> they are "expected to fail"; suite is green
 *   STRICT_DEFECTS=1 npx playwright test     -> they fail red, proving each defect on the starter build
 */
export default defineConfig({
  testDir: path.resolve(__dirname, 'tests'),
  testMatch: /.*\.spec\.ts/,
  outputDir: path.resolve(__dirname, 'test-results'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  reporter: [
    ['html', { open: 'never', outputFolder: path.resolve(__dirname, 'playwright-report') }],
    ['list'],
  ],
  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // Set PW_CHANNEL=chrome (or msedge) to use the browser already installed on your computer.
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [
    {
      name: 'api',
      testDir: path.resolve(__dirname, 'tests/api'),
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:7080' },
    },
    {
      name: 'storefront',
      testDir: path.resolve(__dirname, 'tests/storefront'),
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:7080' },
    },
    {
      name: 'ops',
      testDir: path.resolve(__dirname, 'tests/ops'),
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:7300' },
    },
  ],
});
