import { expect, test } from '@playwright/test';
import { measureOverflow, mockApi } from './support';

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test.describe(`tema em ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, colorScheme: 'light' });

    test('troca sem reload, mantém preferências e abre modal nos dois temas', async ({ page }) => {
      await mockApi(page);
      await page.goto('/preferencias');
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      const panel = page.locator('.preferences .panel').first();
      await expect(panel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await page.locator('input[value=compact] + span').click();
      const navigation = await page.evaluate(() => performance.timeOrigin);

      await page.locator('input[name=preferences-theme][value=dark] + span').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(panel).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await expect(page.locator('input[value=compact]')).toBeChecked();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(navigation);
      await expect(page.locator('header.topbar')).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await expect(page.locator('aside.sidebar')).toHaveCSS('background-image', /rgb\(23, 37, 84\)/);
      await page.locator('.notification-btn').click();
      await expect(page.locator('.notification-dropdown')).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await page.locator('.notification-btn').click();
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('preferencias-dark.png') });

      await page.locator('aside.sidebar a[href="/treasury"]').click();
      await expect(page.getByRole('heading', { name: 'Lançamentos financeiros' })).toBeVisible();
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(navigation);
      await expect(page.locator('canvas')).toBeVisible();
      const kpiIcon = page.locator('app-kpi-component .image-container').first();
      await expect(kpiIcon).toHaveCSS('background-color', 'rgb(34, 55, 98)');
      const iconStyle = await kpiIcon.evaluate(el => {
        const icon = getComputedStyle(el, '::after');
        return { color: icon.backgroundColor, mask: icon.maskImage };
      });
      expect(iconStyle.color).toBe('rgb(125, 211, 252)');
      expect(iconStyle.mask).toContain('/icons/wallet-icon.svg');
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('tesouraria-dark.png') });
      await page.getByRole('button', { name: 'Novo lançamento' }).click();
      const modal = page.getByRole('dialog');
      await expect(modal).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await modal.locator('input[name=descricao]').fill('Descrição de teste');
      await expect(modal.locator('input[name=descricao]')).toHaveValue('Descrição de teste');
      expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('modal-dark.png') });
      await modal.getByRole('button', { name: 'Fechar modal' }).click();

      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('.chart-container')).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await page.goto('/preferencias');
      await page.locator('input[name=preferences-theme][value=light] + span').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(panel).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('preferencias-light.png') });
      await page.locator('aside.sidebar a[href="/treasury"]').click();
      await page.getByRole('button', { name: 'Novo lançamento' }).click();
      await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(kpiIcon).toHaveCSS('background-color', 'rgb(229, 240, 253)');
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('modal-light.png') });
      await modal.getByRole('button', { name: 'Fechar modal' }).click();

      await page.goto('/preferencias');
      await page.locator('input[name=preferences-theme][value=system] + span').click();
      await page.reload();
      await expect(page.locator('input[name=preferences-theme][value=system]')).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await page.locator('aside.sidebar a[href="/treasury"]').click();
      const statusFilter = page.locator('.toolbar label').filter({ has: page.getByText('Status', { exact: true }) }).locator('select');
      await statusFilter.selectOption('Pago');
      await page.getByRole('button', { name: 'Novo lançamento' }).click();
      const description = modal.locator('input[name=descricao]');
      await description.fill('Rascunho');
      await page.emulateMedia({ colorScheme: 'dark' });
      await expect(modal).toHaveCSS('background-color', 'rgb(31, 41, 55)');
      await expect(description).toHaveValue('Rascunho');
      await expect(statusFilter).toHaveValue('Pago');
    });
  });
}
