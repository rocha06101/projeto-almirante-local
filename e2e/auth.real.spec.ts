import { expect, Page, test } from '@playwright/test';

/**
 * Contra o backend REAL local (https://localhost:8444, via proxy do dev-server em https://localhost:4201).
 * O fluxo completo exige E2E_EMAIL e E2E_PASSWORD no ambiente (nunca versionados nem logados).
 */
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];

interface Traffic {
  csrf: number;
  login: { status: number; hasCsrfHeader: boolean }[];
  refresh: { status: number; hasCsrfHeader: boolean }[];
  logout: { status: number; hasCsrfHeader: boolean; hasBearer: boolean }[];
  me: { status: number; hasBearer: boolean }[];
}

/** Registra o contrato observado na rede SEM guardar valores de token/cookie. */
function watch(page: Page): Traffic {
  const traffic: Traffic = { csrf: 0, login: [], refresh: [], logout: [], me: [] };

  page.on('response', async response => {
    const request = response.request();
    const path = new URL(response.url()).pathname.toLowerCase();
    const headers = request.headers();
    const hasCsrfHeader = !!headers['x-csrf-token'];

    if (path === '/api/auth/csrf') traffic.csrf++;
    if (path === '/api/auth/login') traffic.login.push({ status: response.status(), hasCsrfHeader });
    if (path === '/api/auth/refresh') traffic.refresh.push({ status: response.status(), hasCsrfHeader });
    if (path === '/api/auth/logout') {
      traffic.logout.push({ status: response.status(), hasCsrfHeader, hasBearer: !!headers['authorization'] });
    }
    if (path === '/api/auth/me') traffic.me.push({ status: response.status(), hasBearer: !!headers['authorization'] });
  });

  return traffic;
}

async function fillLogin(page: Page, user: string, pass: string) {
  await page.getByLabel('Email').fill(user);
  await page.getByLabel('Senha').fill(pass);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

test('credenciais inválidas: CSRF é enviado e a API responde 401 (não 400)', async ({ page }) => {
  const traffic = watch(page);
  await page.goto('/login');
  await page.locator('app-login form').waitFor(); // aguarda o (primeiro) build/carregamento do dev-server
  await fillLogin(page, 'inexistente@example.com', 'senha-incorreta-123');

  await expect(page.getByRole('alert')).toContainText('E-mail ou senha inválidos', { timeout: 30_000 });
  expect(traffic.csrf).toBeGreaterThanOrEqual(1);
  expect(traffic.login).toEqual([{ status: 401, hasCsrfHeader: true }]);

  // Nada de credencial em Web Storage.
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(storage).not.toMatch(/token|auth/i);
});

test('rota protegida sem sessão: tenta refresh (com CSRF), recebe 401 e vai para /login', async ({ page }) => {
  const traffic = watch(page);
  await page.goto('/desbravadores');
  await expect(page).toHaveURL(/\/login$/);
  expect(traffic.refresh).toEqual([{ status: 401, hasCsrfHeader: true }]);
});

test.describe('fluxo completo autenticado', () => {
  test.skip(!email || !password, 'defina E2E_EMAIL e E2E_PASSWORD para exercitar o login real');

  test('login → rota protegida → reload (refresh por cookie) → logout', async ({ page, context }) => {
    const traffic = watch(page);

    // Login
    await page.goto('/login');
    await fillLogin(page, email!, password!);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-home')).toBeVisible();
    expect(traffic.login).toEqual([{ status: 200, hasCsrfHeader: true }]);
    expect(traffic.me.at(-1)).toEqual({ status: 200, hasBearer: true });

    // Cookies: refresh HttpOnly + Secure + SameSite=Strict; CSRF idem; nenhum token em Web Storage.
    const cookies = await context.cookies();
    const refresh = cookies.find(c => c.name === '__Host-almirante-refresh');
    expect(refresh, 'cookie de refresh presente').toBeTruthy();
    expect(refresh).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage).not.toMatch(/token|auth|bearer/i);

    // Perfil real no topbar (vindo de /Auth/Me).
    await expect(page.locator('.profile-btn .user-name')).not.toHaveText('Usuário');

    // Navegação protegida por cliques reais
    await page.getByRole('link', { name: 'Desbravadores' }).click();
    await expect(page).toHaveURL(/\/desbravadores$/);
    await expect(page.locator('app-desbravadores table, app-desbravadores .state-card').first()).toBeVisible();

    // Reload: memória zerada → sessão restaurada via cookie de refresh (com CSRF)
    const refreshesBefore = traffic.refresh.length;
    await page.reload();
    await expect(page).toHaveURL(/\/desbravadores$/);
    await expect(page.locator('app-desbravadores')).toBeVisible();
    expect(traffic.refresh.length).toBe(refreshesBefore + 1);
    expect(traffic.refresh.at(-1)).toEqual({ status: 200, hasCsrfHeader: true });

    // Logout pela UI
    await page.locator('.profile-btn').click();
    await page.getByRole('button', { name: 'Sair do Sistema' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(traffic.logout.at(-1)).toEqual({ status: 204, hasCsrfHeader: true, hasBearer: true });

    // Sessão realmente invalidada no servidor: reload numa rota protegida volta ao login.
    await page.goto('/desbravadores');
    await expect(page).toHaveURL(/\/login$/);
    expect(traffic.refresh.at(-1)?.status).toBe(401);
  });
});
