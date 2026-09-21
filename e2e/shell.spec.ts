import { expect, test } from '@playwright/test';
import { mockApi } from './support';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test.describe('desktop 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test('barra lateral completa; alternar recolhe para o trilho e o conteúdo acompanha', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside.sidebar');
    await expect(sidebar).toHaveClass(/expanded/);
    await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(250);
    const before = (await page.locator('main.main-content').boundingBox())!;

    await page.getByRole('button', { name: 'Recolher menu lateral' }).click();
    await expect(sidebar).not.toHaveClass(/expanded/);
    await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(80);
    const after = (await page.locator('main.main-content').boundingBox())!;
    expect(after.x).toBeLessThan(before.x);
    // topbar acompanha a largura da navegação
    expect(Math.round((await page.locator('header.topbar').boundingBox())!.x)).toBe(80);
  });

  test('navegação por cliques e logout pela UI', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Desbravadores' }).click();
    await expect(page).toHaveURL(/\/desbravadores$/);
    await expect(page.getByRole('link', { name: 'Desbravadores' })).toHaveAttribute('aria-current', 'page');

    await page.goto('/');
    await page.getByRole('link', { name: 'Tesouraria' }).click();
    await expect(page).toHaveURL(/\/treasury$/);

    const logout = page.waitForRequest(r => r.url().endsWith('/api/Auth/logout') && r.method() === 'POST');
    await page.locator('.profile-btn').click();
    await page.getByRole('button', { name: 'Sair do Sistema' }).click();
    const request = await logout;
    expect(request.headers()['x-csrf-token']).toBe('csrf-de-teste');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('teclado: link "Ir para o conteúdo" e foco visível', async ({ page }) => {
    await page.goto('/');
    await page.locator('app-home').waitFor();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Ir para o conteúdo' });
    await expect(skip).toBeFocused();
    expect((await skip.boundingBox())!.y).toBeGreaterThanOrEqual(0);

    // O anel de foco aparece em controles da navegação (outline visível).
    await page.locator('.sidebar .nav-item').first().focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const outline = await page.locator('.sidebar .nav-item').first().evaluate(el => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');
  });
});

test.describe('tablet retrato 768x1024', () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test('começa como trilho de ícones (80px) e expande por toque', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside.sidebar');
    await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(80);
    await page.getByRole('button', { name: 'Expandir menu lateral' }).tap();
    await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(250);
    await expect(page.locator('.sidebar .label').first()).toBeVisible();
  });
});

test.describe('celular 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('barra inferior fixa, sem barra lateral, com item ativo', async ({ page }) => {
    await page.goto('/desbravadores');
    const box = (await page.locator('aside.sidebar').boundingBox())!;
    expect(Math.round(box.y + box.height)).toBe(844);
    expect(Math.round(box.width)).toBe(390);
    await expect(page.locator('.sidebar-header')).toBeHidden();
    await expect(page.locator('.nav-item.active')).toHaveCount(1);
  });

  test('rotação para paisagem (844x390) mantém tudo utilizável', async ({ page }) => {
    await page.goto('/treasury');
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('header.topbar')).toBeVisible();
    await expect(page.locator('.sidebar-nav .nav-item').first()).toBeVisible();
  });

  test('áreas de toque dos controles principais >= 44px (shell e ações)', async ({ page }) => {
    for (const path of ['/', '/desbravadores', '/treasury', '/desbravadores/cadastrar']) {
      await page.goto(path);
      await page.locator('main.main-content > :not(router-outlet)').first().waitFor();
      const small = await page.evaluate(() => {
        const selector = 'header button, aside a, aside button, main button, main select, main input:not([type=hidden]):not(.search-input), main a.main-section, main .view-all';
        return Array.from(document.querySelectorAll<HTMLElement>(selector))
          .filter(el => {
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && el.closest('.sr-only') === null;
          })
          .filter(el => {
            const r = el.getBoundingClientRect();
            // A barra de rolagem/labels ocultos não contam; o alvo é a caixa do controle.
            return r.height < 43.5 || (r.width < 43.5 && el.tagName !== 'INPUT');
          })
          .map(el => `${el.tagName.toLowerCase()}.${el.className} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
      });
      expect(small, `alvos pequenos em ${path}`).toEqual([]);
    }
  });
});
