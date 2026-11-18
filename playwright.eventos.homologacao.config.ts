import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /eventos\.homologacao\.real\.spec\.ts/,
  outputDir: './test-results/eventos-homologacao',
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'https://localhost:4213',
    ignoreHTTPSErrors: true,
    actionTimeout: 12_000,
    timezoneId: 'America/Sao_Paulo',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
