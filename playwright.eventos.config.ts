import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: /eventos\.spec\.ts/, outputDir: './test-results/eventos',
  fullyParallel: true, workers: 2, timeout: 45_000, expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'https://localhost:4201', browserName: 'chromium', ignoreHTTPSErrors: true, timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
  webServer: { command: 'npm run start:local', url: 'https://localhost:4201', ignoreHTTPSErrors: true, reuseExistingServer: true, timeout: 180_000 },
});
