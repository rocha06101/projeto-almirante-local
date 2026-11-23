import { expect, test } from '@playwright/test';
import type { EventoParticipante } from '../src/app/core/models/evento.model';
import { mockApi } from './support';

for (const width of [320, 1366]) {
  const colorScheme = width === 320 ? 'dark' : 'light';
  test(`membro consulta e reabre seus eventos a ${width}px (${colorScheme})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.emulateMedia({ colorScheme });
    await mockApi(page);
    await page.route('**/api/Me/Permissoes', route =>
      route.fulfill({ json: { permissoes: [], permissoesPorDesignacao: [], versaoAutorizacao: 1 } }),
    );
    const evento: EventoParticipante = {
      id: 'evento-1',
      titulo: 'Trilha',
      descricao: null,
      dataEvento: '2026-11-25',
      local: 'Sede',
      valorPorMembro: 0,
      seguroObrigatorio: 0,
      transporte: { valor: 0, ehGratis: true },
      alimentacao: { valor: 0, individual: true },
      minhaCobranca: null,
      minhasDevolucoes: [
        { valor: 10, vencimento: '2026-11-25', status: 'Pendente' },
        {
          valor: 20, vencimento: '2026-11-25', status: 'Pago', valorDevolvido: 12.5,
          dataDevolucao: '2026-11-23', justificativa: 'Diferença registrada pela tesouraria.',
        },
      ],
    };
    let consultas = 0;
    const chamadasAdministrativas: string[] = [];
    page.on('request', request => {
      const path = new URL(request.url()).pathname;
      if (/^\/api\/(Eventos|Lancamentos)(\/|$)/i.test(path)) chamadasAdministrativas.push(path);
    });
    await page.route('**/api/Me/Eventos', route => {
      expect(route.request().method()).toBe('GET');
      consultas++;
      return route.fulfill({ json: { items: [evento] } });
    });

    await page.goto('/perfil');
    const abrirMenu = () => page.locator('.profile-btn').click();
    const abrirEventos = async () => {
      await abrirMenu();
      await page.getByRole('button', { name: 'Meus eventos' }).click();
    };
    await abrirEventos();
    const conteudo = page.locator('main');
    await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
    await expect(conteudo.getByRole('heading', { name: 'Meus eventos' })).toBeVisible();
    await expect(conteudo.getByText('Pendente', { exact: true })).toBeVisible();
    await expect(conteudo.getByText('Paga', { exact: true })).toBeVisible();
    await expect(conteudo.getByText('R$ 12,50')).toBeVisible();
    await expect(conteudo.getByRole('button')).toHaveText(['Atualizar']);
    const largura = await conteudo.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(largura).toBeLessThanOrEqual(1);

    await abrirMenu();
    await page.getByRole('button', { name: 'Meu Perfil' }).click();
    await expect(page).toHaveURL(/\/perfil$/);
    await abrirEventos();
    await expect(conteudo.getByText('R$ 12,50')).toBeVisible();
    expect(consultas).toBe(2);
    expect(chamadasAdministrativas).toEqual([]);
  });
}

test('Meus eventos redireciona para o login sem sessão', async ({ page }) => {
  await page.route('**/api/Auth/csrf', route => route.fulfill({ json: { csrfToken: 'teste' } }));
  await page.route('**/api/Auth/refresh', route => route.fulfill({ status: 401 }));
  const consultas: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/api/Me/Eventos')) consultas.push(request.url());
  });
  await page.goto('/meus-eventos');
  await expect(page).toHaveURL(/\/login$/);
  expect(consultas).toEqual([]);
});
