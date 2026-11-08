import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ALL_VIEWPORTS,
  ROUTES,
  SCREENSHOT_VIEWPORTS,
  collectProblems,
  measureOverflow,
  mockApi,
} from './support';

const SHOTS = process.env['E2E_SHOTS'] ?? 'test-results/screens';

async function openResponsiveRoute(
  page: Page,
  route: (typeof ROUTES)[number],
): Promise<void> {
  if (route.path === '/desbravadores/editar') {
    await page.goto('/desbravadores');
    await page.getByRole('button', { name: 'Editar Bartolomeu Fernandes de Albuquerque Cavalcanti' }).click();
  } else {
    await page.goto(route.path);
  }
  await page.locator(route.ready).first().waitFor();
}

async function openCepTestRoute(page: Page, path: string): Promise<void> {
  if (path === '/desbravadores/editar') {
    await page.goto('/desbravadores');
    await page.getByRole('button', { name: 'Editar Bartolomeu Fernandes de Albuquerque Cavalcanti' }).click();
  } else {
    await page.goto(path);
  }
  await page.locator('.container-rigth').waitFor();
}

for (const viewport of ALL_VIEWPORTS) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.width < 1024 });

    test.beforeEach(async ({ page }) => {
      await mockApi(page);
    });

    for (const route of [{ path: '/login', name: 'login', ready: 'app-login form' }, { path: '/register', name: 'register', ready: 'app-register form' }]) {
      test(`${route.name}: sem overflow horizontal e formulário acessível`, async ({ page }) => {
        const problems = collectProblems(page);
        await page.goto(route.path);
        await page.locator(route.ready).waitFor();

        const overflow = await measureOverflow(page);
        expect(overflow.documentOverflow, overflow.offenders.join('\n')).toBeLessThanOrEqual(0);

        // O botão de submit precisa ser alcançável (na viewport ou por rolagem da página).
        const submit = page.locator('form button[type=submit]');
        await submit.scrollIntoViewIfNeeded();
        await expect(submit).toBeInViewport();

        if (SCREENSHOT_VIEWPORTS.has(viewport.name)) {
          await page.screenshot({ path: `${SHOTS}/${viewport.name}-${route.name}.png`, fullPage: process.env['E2E_FULL'] !== '0' });
        }
        expect(problems.filter(p => !p.includes('/api/')), problems.join('\n')).toEqual([]);
      });
    }

    for (const route of ROUTES) {
      test(`${route.name}: sem overflow horizontal, navegação visível e sem erros`, async ({ page }) => {
        const problems = collectProblems(page);
        await openResponsiveRoute(page, route);
        // Aguarda a animação de entrada e o gráfico (Chart.js) assentarem.
        await page.waitForTimeout(700);

        const overflow = await measureOverflow(page);
        expect(overflow.documentOverflow, overflow.offenders.join('\n')).toBeLessThanOrEqual(0);
        expect(overflow.offenders, 'elementos fora da viewport fora de containers roláveis').toEqual([]);

        // No celular as tabelas viram cards: nada pode ficar cortado dentro do container rolável.
        if (viewport.width < 576) {
          const clippedContainers = await page.evaluate(() =>
            Array.from(document.querySelectorAll('main .table-wrapper, main .users-table-card'))
              .filter(el => el.scrollWidth > el.clientWidth + 1)
              .map(el => el.className),
          );
          expect(clippedContainers, 'tabela em card com conteúdo cortado').toEqual([]);
        }

        // Navegação: barra inferior (< 768px) ou lateral (>= 768px), sempre dentro da viewport.
        const sidebar = page.locator('aside.sidebar');
        const box = (await sidebar.boundingBox())!;
        if (viewport.width < 768) {
          expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
          expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1);
        } else {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.width).toBeLessThan(viewport.width / 3);
        }

        // Todos os itens do menu visíveis, com área de toque confortável.
        const items = page.locator('.sidebar-nav .nav-item');
        const count = await items.count();
        for (let i = 0; i < count; i++) {
          const item = (await items.nth(i).boundingBox())!;
          expect(item.x + item.width, `item ${i} fora da viewport`).toBeLessThanOrEqual(viewport.width + 1);
          expect(item.y + item.height, `item ${i} fora da viewport`).toBeLessThanOrEqual(viewport.height + 1);
          expect(Math.round(item.height), `altura do item ${i}`).toBeGreaterThanOrEqual(44);
          expect(Math.round(item.width), `largura do item ${i}`).toBeGreaterThanOrEqual(44);
        }

        // Topbar não cobre o conteúdo: o primeiro bloco começa abaixo dela.
        const topbar = (await page.locator('header.topbar').boundingBox())!;
        const content = (await page.locator('main.main-content > :not(router-outlet)').first().boundingBox())!;
        expect(content.y).toBeGreaterThanOrEqual(topbar.y + topbar.height - 1);

        // Fim da página não fica escondido atrás da barra inferior.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastBottom = await page.evaluate(() => {
          const main = document.querySelector('main.main-content')!;
          const last = main.lastElementChild!.getBoundingClientRect();
          return last.bottom;
        });
        if (viewport.width < 768) {
          expect(lastBottom).toBeLessThanOrEqual(box.y + 1);
        }
        await page.evaluate(() => window.scrollTo(0, 0));

        if (SCREENSHOT_VIEWPORTS.has(viewport.name)) {
          await page.screenshot({ path: `${SHOTS}/${viewport.name}-${route.name}.png`, fullPage: process.env['E2E_FULL'] !== '0' });
        }
        expect(problems.filter(p => !p.includes('/api/')), problems.join('\n')).toEqual([]);
      });
    }

    if (viewport.name === 'phone-320x568' || viewport.name === 'laptop-1366x768') {
      test('modal de lançamento alterna os tipos sem overflow e mantém as ações acessíveis', async ({ page }) => {
        await page.goto('/treasury');
        await page.locator('app-financial-entries-component').waitFor();
        await page.locator('.toolbar .primary-button').click();

        const selector = page.getByLabel('Tipo de lançamento');
        await expect(selector).toHaveValue('unico');
        await expect(page.locator('select[name="membroId"]')).toBeVisible();
        await expect(page.locator('.modal-backdrop')).toHaveCount(1);

        await selector.selectOption('geral');
        await expect(page.locator('.readonly-field strong')).toHaveText('Todos os membros');
        await expect(page.locator('select[name="membroId"]')).toHaveCount(0);
        await expect(page.locator('.modal-actions .primary-button')).toContainText('Salvar lançamento geral');

        const modalBounds = await page.evaluate(() => {
          const modal = document.querySelector('.modal-card')!;
          const bounds = modal.getBoundingClientRect();
          const documentElement = document.documentElement;
          return {
            left: bounds.left,
            right: bounds.right,
            width: bounds.width,
            viewportWidth: innerWidth,
            documentOverflow: documentElement.scrollWidth - documentElement.clientWidth,
          };
        });

        expect(modalBounds.left).toBeGreaterThanOrEqual(-1);
        expect(modalBounds.right).toBeLessThanOrEqual(modalBounds.viewportWidth + 1);
        expect(modalBounds.width).toBeLessThanOrEqual(modalBounds.viewportWidth + 1);
        expect(modalBounds.documentOverflow).toBeLessThanOrEqual(0);

        const saveButton = page.locator('.modal-actions .primary-button');
        await saveButton.scrollIntoViewIfNeeded();
        await expect(saveButton).toBeInViewport();
      });
    }

    test('dropdowns de perfil e notificações permanecem inteiros dentro da viewport', async ({ page }) => {
      await page.goto('/');
      await page.locator('app-home').waitFor();

      for (const [button, dropdown] of [
        ['.notification-btn', '.notification-dropdown'],
        ['.profile-btn', '.profile-dropdown'],
      ]) {
        await page.locator(button).click();
        const panel = page.locator(dropdown);
        await expect(panel).toBeVisible();
        await page.waitForTimeout(300); // animação slideDown

        const box = (await panel.boundingBox())!;
        expect(box.x, `${dropdown} à esquerda`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${dropdown} acima`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${dropdown} à direita`).toBeLessThanOrEqual(viewport.width + 1);
        // Pode rolar internamente em telas baixas, mas nunca passa da viewport.
        expect(box.y + box.height, `${dropdown} abaixo`).toBeLessThanOrEqual(viewport.height + 1);

        if (SCREENSHOT_VIEWPORTS.has(viewport.name)) {
          await page.screenshot({ path: `${SHOTS}/${viewport.name}-dropdown-${dropdown.replace('.', '')}.png` });
        }

        // Fecha com Escape e reabre no mesmo botão; clique fora também fecha.
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      }

      await page.locator('.notification-btn').click();
      await page.locator('main.main-content').click({ position: { x: 5, y: 200 }, force: true });
      await expect(page.locator('.notification-dropdown')).toBeHidden();
    });
  });
}

test.describe('consulta de CEP nos perfis', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const path of ['/perfil', '/desbravadores/editar']) {
    test(`${path}: feedback, retry e associação acessível`, async ({ page }) => {
      await mockApi(page);
      await page.route('https://viacep.com.br/ws/22222222/json/', route =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Serviço temporariamente indisponível' }),
        }),
      );

      const requests: string[] = [];
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.toLowerCase().includes('/cep/')) {
          requests.push(url.pathname.split('/').pop() ?? '');
        }
      });

      await openCepTestRoute(page, path);
      const cep = page.locator('.cep-field app-primary-input input');
      const feedback = page.locator('.cep-feedback');
      const rua = page.locator('[formcontrolname="logradouro"] input');
      const bairro = page.locator('[formcontrolname="bairro"] input');
      const numero = page.locator('[formcontrolname="numero"] input');
      const complemento = page.locator('[formcontrolname="complemento"] input');

      await expect(cep).toHaveAttribute('aria-describedby', /cep-feedback$/);
      await expect(feedback).toHaveAttribute('role', 'status');
      await expect(feedback).toHaveAttribute('aria-live', 'polite');
      expect(requests).toEqual([]);

      await page.locator('.profile-edit-button app-refresh-button').click();
      await numero.fill('42');
      await complemento.fill('Bloco 2');
      await cep.fill('123');
      await expect(feedback).toHaveText('Informe os 8 dígitos do CEP.');
      await expect(cep).toHaveAttribute('aria-invalid', 'true');
      expect(requests).toEqual([]);

      await cep.fill('01001000');
      await expect(feedback).toHaveText(
        'Endereço encontrado. Confira os dados e informe o número.',
      );
      await expect(rua).toHaveValue('Rua da consulta');
      await expect(bairro).toHaveValue('Centro');
      await expect(numero).toHaveValue('42');
      await expect(complemento).toHaveValue('Bloco 2');
      expect(requests).toContain('01001000');

      await cep.fill('00000000');
      await expect(feedback).toHaveText('CEP não encontrado. Confira os 8 dígitos.');
      await expect(cep).not.toHaveAttribute('aria-invalid', 'true');

      await cep.fill('22222222');
      await expect(feedback).toHaveText('Não foi possível consultar o CEP. Tente novamente.');
      await page.getByRole('button', { name: 'Tentar novamente' }).click();
      await expect(feedback).toHaveText('Não foi possível consultar o CEP. Tente novamente.');
      expect(requests.filter(value => value === '22222222')).toHaveLength(2);
    });
  }
});
