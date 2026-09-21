import { defineConfig } from '@playwright/test';

/**
 * E2E com navegador real (Chrome instalado no sistema; nenhum download de browser).
 *
 *  - `layout` (padrão): dev-server HTTPS (`npm run start:local`) com a API interceptada,
 *    para validar a matriz de viewports de forma determinística.
 *  - `real-backend`: mesmo dev-server contra o backend local (https://localhost:8444);
 *    exige E2E_EMAIL e E2E_PASSWORD no ambiente.
 *  - `pwa`: build de produção servido de dist/ (`npm run serve:dist`) para validar manifest e service worker.
 */
const usePwa = /--project[= ]pwa/.test(process.argv.join(' '));

const devServer = {
  command: 'npm run start:local',
  url: 'https://localhost:4201',
  ignoreHTTPSErrors: true,
  reuseExistingServer: true,
  timeout: 180_000,
};

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env['E2E_OUT'] ?? './test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env['CI'] ? 2 : 4,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    ignoreHTTPSErrors: true,
    trace: 'off',
  },
  projects: [
    {
      name: 'layout',
      testMatch: /(responsive|shell)\.spec\.ts/,
      use: { baseURL: 'https://localhost:4201' },
    },
    {
      name: 'real-backend',
      testMatch: /(auth\.real|dbg)\.spec\.ts/,
      use: { baseURL: 'https://localhost:4201' },
      fullyParallel: false,
      workers: 1,
    },
    {
      name: 'pwa',
      testMatch: /pwa\.spec\.ts/,
      use: { baseURL: 'http://localhost:4300' },
    },
  ],
  webServer: usePwa
    ? {
        command: 'node scripts/serve-dist.mjs --http --port 4300 --api https://localhost:8444',
        url: 'http://localhost:4300/manifest.webmanifest',
        ignoreHTTPSErrors: true,
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : devServer,
});
