import { defineConfig, devices } from '@playwright/test';

const PORT = 4100;
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/depreciation_e2e';

/**
 * Browser tests against the production build (API serving the built React app).
 * Run `npm run build` first.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: 'npm run db:seed && node apps/api/dist/index.js',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: { PORT: String(PORT), DATABASE_URL, WEB_DIST: 'apps/web/dist', NODE_ENV: 'test' },
    timeout: 60_000,
  },
});
