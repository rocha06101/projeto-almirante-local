import { expect, Page, test } from '@playwright/test';

/**
 * Lançamentos contra o backend REAL (https://localhost:8444), conforme o contrato do Swagger:
 * GET /api/Lancamentos, POST /api/Lancamentos/Registrar, PUT /{id}, DELETE /{id} (corpo { motivo }).
 * Cria UM lançamento marcado "E2E-TESTE" e o exclui no fim (exclusão lógica com auditoria).
 * Exige E2E_EMAIL e E2E_PASSWORD (perfil da diretoria, política GestaoFinanceira).
 */
const email = process.env['E2E_EMAIL'];
const password = process.env['E2E_PASSWORD'];

test.skip(!email || !password, 'defina E2E_EMAIL e E2E_PASSWORD');

/** O backend limita o login a 3/min por IP: se vier 429, espera o Retry-After e tenta de novo. */
async function login(page: Page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Senha').fill(password!);
    const response = page.waitForResponse(r => r.url().endsWith('/api/Auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Entrar' }).click();
    const status = (await response).status();
    if (status !== 429) {
      expect(status).toBe(200);
      await expect(page).toHaveURL(/\/$/);
      return;
    }
    await page.waitForTimeout(65_000);
  }
  throw new Error('login bloqueado pelo rate limit');
}

/** Exclui (com motivo) qualquer lançamento de teste que tenha sobrado de uma execução interrompida. */
async function limparResiduos(page: Page) {
  await page.getByRole('searchbox', { name: 'Pesquisar lançamentos' }).fill('E2E-TESTE');
  await page.waitForResponse(r => r.url().includes('/api/Lancamentos?') && r.url().includes('search=E2E-TESTE'));
  for (let guard = 0; guard < 20; guard++) {
    const rows = page.locator('tbody tr');
    if ((await rows.count()) === 0) break;
    await rows.first().getByRole('button', { name: /Excluir/ }).click();
    await page.getByRole('dialog').getByLabel('Motivo da exclusão').fill('limpeza de resíduo do teste E2E');
    const reloaded = page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('/api/Lancamentos?'));
    await page.getByRole('button', { name: 'Excluir', exact: true }).click();
    await reloaded; // a lista é recarregada depois da exclusão
    await expect(page.getByRole('dialog')).toBeHidden();
  }
  await page.getByRole('searchbox', { name: 'Pesquisar lançamentos' }).fill('');
}

test('menu lateral → Lançamentos → registrar, ver, editar e excluir pela API real', async ({ page }) => {
  test.setTimeout(180_000);
  const calls: string[] = [];
  page.on('response', r => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/Lancamentos')) calls.push(`${r.request().method()} ${path.replace(/[0-9a-f-]{36}/, '{id}')} ${r.status()}`);
  });

  await login(page);

  // Item do menu lateral
  await page.locator('aside.sidebar').getByRole('link', { name: 'Lançamentos' }).click();
  await expect(page).toHaveURL(/\/lancamentos$/);
  await expect(page.locator('app-financial-entries-component table')).toBeVisible();
  await expect.poll(() => calls.some(c => c.startsWith('GET /api/Lancamentos 200'))).toBe(true);

  await limparResiduos(page);

  // Registrar (individual → 201)
  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Beneficiário').selectOption({ index: 2 }); // 0 = placeholder, 1 = "Todos os membros"
  await dialog.getByLabel('Finalidade').selectOption('Outros');
  await dialog.getByLabel('Descrição (opcional)').fill('E2E-TESTE');
  await dialog.getByLabel('Valor').fill('12.34');
  await dialog.getByLabel('Data de vencimento').fill('2030-01-15');
  await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(calls).toContain('POST /api/Lancamentos/Registrar 201');

  // Localiza pela pesquisa (filtro no servidor) e confere a linha
  await page.getByRole('searchbox', { name: 'Pesquisar lançamentos' }).fill('E2E-TESTE');
  // A pesquisa cobre a descrição (não exibida na tabela): a lista filtrada deve ter só o nosso registro.
  const row = page.locator('tbody tr');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Outros');
  await expect(row).toContainText('R$ 12,34');
  await expect(row).toContainText('15/01/2030');
  await expect(row).toContainText('Pendente');

  // Ver detalhe
  await row.getByRole('button', { name: /Visualizar/ }).click();
  await expect(page.getByRole('dialog')).toContainText('E2E-TESTE'); // descrição aparece no detalhe
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();

  // Editar status → Pago (PUT 200)
  await row.getByRole('button', { name: /Editar/ }).click();
  await page.getByRole('dialog').getByLabel('Status').selectOption('Pago');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(calls).toContain('PUT /api/Lancamentos/{id} 200');
  await expect(page.locator('tbody tr')).toContainText('Pago');

  // Excluir exige motivo (DELETE 204) e some da lista
  await page.locator('tbody tr').getByRole('button', { name: /Excluir/ }).click();
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Informe o motivo');
  await page.getByRole('dialog').getByLabel('Motivo da exclusão').fill('limpeza do teste E2E');
  await page.getByRole('button', { name: 'Excluir', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(calls).toContain('DELETE /api/Lancamentos/{id} 204');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});
