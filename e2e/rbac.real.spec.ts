import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { APIResponse, Page, expect, test } from '@playwright/test';

const emailAdmin = process.env['E2E_EMAIL'];
const senhaAdmin = process.env['E2E_PASSWORD'];

interface Regra {
  permissao: string;
  cargoAlvoId: string;
}

function cpfFicticio(): string {
  const digitos = Array.from({ length: 9 }, () => randomInt(0, 10));
  while (digitos.length < 11) {
    const soma = digitos.reduce((total, digito, i) => total + digito * (digitos.length + 1 - i), 0);
    digitos.push(((soma * 10) % 11) % 10);
  }
  return digitos.join('');
}

async function login(page: Page, email: string, senha: string): Promise<string> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  const resposta = page.waitForResponse(r => r.url().endsWith('/api/Auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const login = await resposta;
  expect(login.status()).toBe(200);
  return (await login.json()).token.accessToken;
}

async function confirmar(page: Page, senha: string): Promise<void> {
  await page.getByLabel('Motivo', { exact: true }).fill('Validação E2E da issue 186');
  await page.getByLabel('Confirme sua senha').fill(senha);
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
}

async function jsonOk(resposta: APIResponse) {
  expect(resposta.status(), new URL(resposta.url()).pathname).toBe(200);
  return resposta.json();
}

test('AUXSEC consulta membros e eventos e perde acesso na próxima requisição após revogação', async ({ page, browser, baseURL }) => {
  test.skip(!emailAdmin || !senhaAdmin, 'Defina E2E_EMAIL e E2E_PASSWORD para o administrador de teste.');
  test.setTimeout(120_000);

  const sufixo = randomBytes(4).toString('hex');
  const role = `AUXSEC_${sufixo.toUpperCase()}`;
  const nome = `Auxiliar E2E ${sufixo}`;
  const senhaAux = `Teste!A9-${randomBytes(10).toString('hex')}`;
  const emailAux = `auxsec-${sufixo}@example.test`;
  const token = await login(page, emailAdmin!, senhaAdmin!);
  const auth = { Authorization: `Bearer ${token}` };
  const get = (url: string) => page.request.get(`/api${url}`, { headers: auth });
  const csrf = await jsonOk(await get('/Auth/csrf'));
  const headers = { ...auth, 'X-CSRF-TOKEN': csrf.csrfToken };
  const motivo = 'Validação E2E da issue 186';
  const confirmacao = { motivo, senhaAtualSolicitante: senhaAdmin };
  const admin = await jsonOk(await get('/Me/Permissoes'));
  const regrasAdmin = `/Cargos/${admin.cargo.id}/RegrasAlvo`;
  const auxContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  let cargoId: string | undefined;
  let usuarioId: string | undefined;
  let regrasCriadas = false;
  let designacao: { id: string; versao: number } | undefined;

  async function revogarDesignacao(): Promise<void> {
    if (!designacao) return;
    const resposta = await page.request.post(`/api/Almoxarifado/Responsaveis/${designacao.id}/Revogar`, {
      headers, data: { motivo, versao: designacao.versao },
    });
    expect(resposta.status()).toBe(200);
    designacao = undefined;
  }

  try {
    await page.getByRole('link', { name: 'Cargos e permissões' }).click();
    await page.getByRole('button', { name: 'Criar cargo' }).click();
    await page.getByLabel('Role', { exact: true }).fill(role.toLowerCase());
    await page.getByLabel('Nome', { exact: true }).fill(nome);
    await page.getByLabel('Descrição', { exact: true }).fill('Cargo isolado para o cenário AUXSEC.');
    await confirmar(page, senhaAdmin!);
    await expect(page.getByText('Alteração salva.')).toBeVisible();
    const lista = await jsonOk(await get('/Cargos'));
    cargoId = lista.find((c: { role: string }) => c.role === role).id;
    const cargoUrl = `/Cargos/${cargoId}`;
    const linha = page.getByRole('row').filter({ hasText: role });
    const catalogo = await jsonOk(await get('/Permissoes'));
    expect(catalogo.find((p: { chave: string }) => p.chave === 'autorizacao.consultar')).toMatchObject({
      modulo: 'Autorização', ativo: true, reservadaSistema: true,
    });

    const protegido = page.getByRole('row').filter({ hasText: 'Sistema protegido' });
    await expect(protegido.getByRole('button', { name: 'Desativar', exact: true })).toBeDisabled();

    const cargoInicial = lista.find((c: { id: string }) => c.id === cargoId);
    const semMotivo = await page.request.put(`/api${cargoUrl}`, {
      headers, data: { versao: cargoInicial.versao, nome, descricao: 'Sem motivo', senhaAtualSolicitante: senhaAdmin },
    });
    expect(semMotivo.status()).toBe(400);
    expect((await semMotivo.json()).errors.motivo).toBeDefined();
    const semSenha = await page.request.post(`/api${cargoUrl}/Desativar`, {
      headers, data: { versao: cargoInicial.versao, motivo },
    });
    expect(semSenha.status()).toBe(400);

    await page.getByRole('button', { name: 'Criar cargo' }).click();
    await page.getByLabel('Role', { exact: true }).fill(role);
    await page.getByLabel('Nome', { exact: true }).fill(nome);
    await page.getByLabel('Descrição', { exact: true }).fill('Tentativa de role duplicada.');
    await confirmar(page, senhaAdmin!);
    await expect(page.getByLabel('Role', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Confirme sua senha')).toHaveValue('');
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();

    await linha.getByRole('button', { name: 'Editar' }).click();
    expect((await page.request.put(`/api${cargoUrl}`, {
      headers, data: { ...confirmacao, versao: cargoInicial.versao, nome, descricao: 'Alteração concorrente.' },
    })).status()).toBe(200);
    await page.getByLabel('Descrição', { exact: true }).fill('Tentativa com versão antiga.');
    await confirmar(page, senhaAdmin!);
    await expect(page.getByRole('alert')).toContainText('recarregue');
    await page.getByRole('button', { name: 'Recarregar dados' }).click();
    await expect(linha).toContainText('Alteração concorrente.');

    await linha.getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Descrição', { exact: true }).fill('Descrição editada pelo E2E.');
    await confirmar(page, senhaAdmin!);
    await expect(linha).toContainText('Descrição editada pelo E2E.');
    await linha.getByRole('button', { name: 'Desativar', exact: true }).click();
    await confirmar(page, senhaAdmin!);
    await linha.getByRole('button', { name: 'Reativar' }).click();
    await confirmar(page, senhaAdmin!);
    await expect(linha.getByRole('button', { name: 'Desativar', exact: true })).toBeVisible();

    await linha.getByRole('button', { name: 'Permissões', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: /autorizacao.consultar/ })).toBeDisabled();
    await page.getByRole('checkbox', { name: /membros.consultar/ }).check();
    await page.getByRole('checkbox', { name: /eventos.consultar/ }).check();
    await page.getByRole('button', { name: 'Revisar alterações' }).click();
    await confirmar(page, senhaAdmin!);
    await expect(page.getByText('Alteração salva.')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await linha.getByRole('button', { name: 'Regras por alvo' }).click();
    await expect(page.getByRole('region', { name: 'Matriz de regras por alvo' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole('checkbox', { name: `usuarios.criar sobre ${nome}`, exact: true }).check();
    await page.getByRole('button', { name: 'Revisar alterações' }).click();
    await expect(page.getByText(`usuarios.criar → ${role}`)).toBeVisible();
    await confirmar(page, senhaAdmin!);
    await expect(page.getByText('Alteração salva.')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 720 });
    const conjuntoRegras = await jsonOk(await get(`${cargoUrl}/RegrasAlvo`));
    expect(conjuntoRegras.regras).toHaveLength(1);
    expect(conjuntoRegras.regras[0]).toMatchObject({ permissao: 'usuarios.criar', cargoAlvoId: cargoId });
    const conflitoRegras = await page.request.put(`/api${cargoUrl}/RegrasAlvo`, {
      headers, data: { ...confirmacao, versao: 1, regras: [] },
    });
    expect(conflitoRegras.status()).toBe(409);
    const regrasInvalidas = await page.request.put(`/api${cargoUrl}/RegrasAlvo`, {
      headers, data: { ...confirmacao, versao: conjuntoRegras.versao,
        regras: [{ permissao: 'usuarios.editar', cargoAlvoId: cargoId },
          { permissao: 'usuarios.criar', cargoAlvoId: randomUUID() }] },
    });
    expect(regrasInvalidas.status()).toBe(400);
    expect((await jsonOk(await get(`${cargoUrl}/RegrasAlvo`))).regras).toEqual(conjuntoRegras.regras);

    const anterior = await jsonOk(await get(regrasAdmin));
    const regras = anterior.regras.map(({ permissao, cargoAlvoId }: Regra) => ({ permissao, cargoAlvoId }));
    const preparar = await page.request.put(`/api${regrasAdmin}`, {
      headers,
      data: { ...confirmacao, versao: anterior.versao, regras: [...regras,
        { permissao: 'usuarios.criar', cargoAlvoId: cargoId },
        { permissao: 'usuarios.excluir', cargoAlvoId: cargoId },
      ] },
    });
    expect(preparar.status()).toBe(200);
    regrasCriadas = true;
    const usuario = await page.request.post('/api/Usuarios', {
      headers,
      data: { nome, email: emailAux, senha: senhaAux, cargoId, cpf: cpfFicticio(), ehCin: true },
    });
    expect(usuario.status()).toBe(201);
    usuarioId = (await usuario.json()).id;
    await linha.getByRole('button', { name: 'Desativar', exact: true }).click();
    await confirmar(page, senhaAdmin!);
    await expect(page.getByRole('alert')).toContainText('Reatribua-os a outro cargo');
    await page.getByRole('button', { name: 'Fechar', exact: true }).click();

    const auxiliar = await auxContext.newPage();
    const tokenAux = await login(auxiliar, emailAux, senhaAux);
    const auxHeaders = { Authorization: `Bearer ${tokenAux}` };
    const consultarAux = (url: string) => auxiliar.request.get(`/api${url}`, { headers: auxHeaders });
    const antes = await jsonOk(await consultarAux('/Me/Permissoes'));
    expect(Object.keys(antes).sort()).toEqual(['cargo', 'permissoes', 'permissoesPorDesignacao', 'versaoAutorizacao']);
    expect(antes.cargo.role).toBe(role);
    expect(antes.permissoes).toEqual(['eventos.consultar', 'membros.consultar']);
    expect((await consultarAux('/Permissoes')).status()).toBe(403);
    expect((await consultarAux('/Usuarios')).status()).toBe(403);
    expect((await page.request.get('/api/Me/Permissoes')).status()).toBe(401);
    const inexistente = await get(`/Cargos/${randomUUID()}/Permissoes`);
    expect(inexistente.status()).toBe(404);
    expect((await inexistente.json()).title).toContain('Cargo não encontrado');

    const designar = await page.request.post('/api/Almoxarifado/Responsaveis', {
      headers,
      data: { membroId: usuarioId, dataInicio: new Date().toISOString().slice(0, 10), observacoes: motivo },
    });
    expect(designar.status()).toBe(201);
    designacao = await designar.json();
    const designada = await jsonOk(await consultarAux('/Me/Permissoes'));
    expect(designada.permissoesPorDesignacao).toEqual(['almoxarifado.consultar', 'almoxarifado.gerenciar']);
    expect(designada.permissoes).toEqual([
      'almoxarifado.consultar', 'almoxarifado.gerenciar', 'eventos.consultar', 'membros.consultar',
    ]);
    await revogarDesignacao();
    await auxiliar.goto('/admin/cargos');
    await expect(auxiliar).toHaveURL(/\/perfil$/);
    await expect(auxiliar.getByRole('link', { name: 'Cargos e permissões' })).toHaveCount(0);
    await expect(auxiliar.getByRole('link', { name: 'Tesouraria' })).toHaveCount(0);

    await auxiliar.getByRole('link', { name: 'Desbravadores' }).click();
    await expect(auxiliar.locator('app-desbravadores table')).toBeVisible();
    await expect(auxiliar.getByRole('link', { name: 'Cadastrar' })).toHaveCount(0);
    await expect(auxiliar.getByRole('columnheader', { name: 'Ações' })).toHaveCount(0);
    expect(await auxiliar.locator('app-desbravadores').innerHTML()).not.toContain(usuarioId);
    const eventosUrl = (resposta: { url(): string }) => new URL(resposta.url()).pathname === '/api/Eventos';
    const liberada = auxiliar.waitForResponse(eventosUrl);
    await auxiliar.getByRole('link', { name: 'Eventos' }).click();
    expect((await liberada).status()).toBe(200);
    await expect(auxiliar.getByRole('heading', { name: 'Eventos' })).toBeVisible();

    await linha.getByRole('button', { name: 'Permissões', exact: true }).click();
    await page.getByRole('checkbox', { name: /eventos.consultar/ }).uncheck();
    await page.getByRole('button', { name: 'Revisar alterações' }).click();
    await confirmar(page, senhaAdmin!);
    await expect(page.getByText('Alteração salva.')).toBeVisible();
    const recusada = auxiliar.waitForResponse(eventosUrl);
    await auxiliar.getByRole('button', { name: 'Atualizar eventos' }).click();
    expect((await recusada).status()).toBe(403);
    await expect(auxiliar.getByRole('link', { name: 'Eventos' })).toHaveCount(0);
    await expect(auxiliar.getByRole('alert')).toBeVisible();
    expect((await consultarAux('/Eventos')).status()).toBe(403);
    const depois = await jsonOk(await consultarAux('/Me/Permissoes'));
    expect(depois.permissoes).toEqual(['membros.consultar']);
    expect(depois.versaoAutorizacao).toBeGreaterThan(antes.versaoAutorizacao);

    const invalidas = await page.request.put(`/api${cargoUrl}/Permissoes`, {
      headers,
      data: { ...confirmacao, versao: (await jsonOk(await get(`${cargoUrl}/Permissoes`))).versao,
        permissoes: ['eventos.consultar', 'chave.inexistente'] },
    });
    expect(invalidas.status()).toBe(400);
    expect((await invalidas.json()).errors.permissoes).toBeDefined();
    const obsoleto = await page.request.put(`/api${cargoUrl}/Permissoes`, {
      headers,
      data: { ...confirmacao, versao: 1, permissoes: ['eventos.consultar'] },
    });
    expect(obsoleto.status()).toBe(409);
    expect((await obsoleto.json()).versaoAtual).toBeGreaterThan(1);
    expect((await jsonOk(await get(`${cargoUrl}/Permissoes`))).permissoes).toEqual(['membros.consultar']);
  } finally {
    try {
      await revogarDesignacao();
      if (usuarioId) expect((await page.request.delete(`/api/Usuarios/${usuarioId}`, { headers })).status()).toBe(204);
      if (regrasCriadas) {
        const atual = await jsonOk(await get(regrasAdmin));
        const regras = atual.regras.filter((r: Regra) => r.cargoAlvoId !== cargoId)
          .map(({ permissao, cargoAlvoId }: Regra) => ({ permissao, cargoAlvoId }));
        expect((await page.request.put(`/api${regrasAdmin}`, {
          headers, data: { ...confirmacao, versao: atual.versao, regras },
        })).status()).toBe(200);
      }
      if (cargoId) {
        const cargos = await jsonOk(await get('/Cargos'));
        const cargo = cargos.find((c: { id: string }) => c.id === cargoId);
        if (cargo.ativo) {
          expect((await page.request.post(`/api/Cargos/${cargoId}/Desativar`, {
            headers, data: { ...confirmacao, versao: cargo.versao },
          })).status()).toBe(200);
        }
      }
    } finally {
      await auxContext.close();
    }
  }
});
