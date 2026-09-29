import { expect, test } from '@playwright/test';

/**
 * Valida o PWA sobre o BUILD DE PRODUÇÃO servido de dist/ (npm run build && npm run test:e2e:pwa).
 * O service worker do Angular só existe no build de produção, nunca no `ng serve`.
 */
test.use({ serviceWorkers: 'allow' });

test('manifest válido e todos os ícones declarados existem', async ({ page, request }) => {
  await page.goto('/login');

  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  expect(href).toBeTruthy();

  const response = await request.get(new URL(href!, page.url()).toString());
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('manifest+json');
  const manifest = await response.json();

  expect(manifest).toMatchObject({
    name: expect.any(String),
    short_name: expect.any(String),
    start_url: '/',
    display: 'standalone',
    background_color: expect.stringMatching(/^#/),
    theme_color: expect.stringMatching(/^#/),
  });

  const purposes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']));

  for (const icon of manifest.icons) {
    const res = await request.get(new URL(icon.src, page.url()).toString());
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toBe('image/png');
  }

  await expect(page.locator('meta[name=theme-color]')).toHaveAttribute('content', manifest.theme_color);
  await expect(page.locator('meta[name=viewport]')).toHaveAttribute('content', /width=device-width, initial-scale=1/);
  await expect(page.locator('link[rel=apple-touch-icon]')).toHaveCount(1);
});

test('service worker registra, ativa e controla a página; shell abre offline', async ({ page, context }) => {
  await page.goto('/login');
  await page.locator('app-login form').waitFor();

  // registrationStrategy é "registerWhenStable:30000": aguarda o registro.
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), {
    timeout: 45_000,
  }).toBe('activated');

  // Recarrega para a página passar a ser controlada e aguarda o prefetch do shell.
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await page.waitForTimeout(3000);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('app-login form')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Realizar Login' })).toBeVisible();
  await context.setOffline(false);
});

test('respostas da API não entram em nenhum cache do service worker', async ({ page, request }) => {
  await page.goto('/login');
  await page.locator('app-login form').waitFor();
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 45_000 }).toBe('activated');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);

  // Chamadas reais à API pelo contexto da página (passam pelo service worker).
  const status = await page.evaluate(async () => (await fetch('/api/Auth/csrf', { credentials: 'include' })).status);
  expect(status).toBe(200);
  await page.evaluate(async () => { await fetch('/api/Auth/refresh', { method: 'POST', credentials: 'include' }); });

  const cachedUrls = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    return urls;
  });

  expect(cachedUrls.length, 'o shell deve estar em cache').toBeGreaterThan(0);
  expect(cachedUrls.filter(u => new URL(u).pathname.startsWith('/api/'))).toEqual([]);

  // Config do ngsw: sem dataGroups (nada de API) e /api fora das navegações.
  const ngsw = await (await request.get('/ngsw.json')).json();
  expect(ngsw.dataGroups ?? []).toEqual([]);
  expect(ngsw.navigationUrls.some((u: { positive: boolean; regex: string }) => !u.positive && u.regex.includes('api'))).toBe(true);
});
