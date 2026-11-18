import { randomInt, randomUUID } from 'node:crypto';
import { APIResponse, expect, Page, test } from '@playwright/test';
import type { EventoDto } from '../src/app/core/models/evento.model';

// Executar somente com a instância descartável documentada no relatório.
const senhaAdmin = process.env['ISSUE213_SENHA_ADMIN'];
const emailAdmin = 'admin@issue213.test';
const prefixo = 'HOMOLOG-213';
const confirmarExclusao = 'Confirmo a exclusão e a desativação das cobranças pendentes.';

function cpfFicticio(): string {
  const digitos = Array.from({ length: 9 }, () => randomInt(0, 10));
  while (digitos.length < 11) {
    const soma = digitos.reduce((total, digito, i) => total + digito * (digitos.length + 1 - i), 0);
    digitos.push(((soma * 10) % 11) % 10);
  }
  return digitos.join('');
}

async function entrar(page: Page, email: string, senha: string): Promise<string> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(senha);
  const resposta = page.waitForResponse(r => r.url().endsWith('/api/Auth/login') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const login = await resposta;
  expect(login.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login$/);
  return (await login.json()).token.accessToken;
}

function corpoEdicao(e: EventoDto, alteracoes: Partial<EventoDto> = {}) {
  const { titulo, descricao, local, dataEvento, membros, transporte, alimentacao, seguroObrigatorio, versao } = { ...e, ...alteracoes };
  return { titulo, descricao, local, dataEvento, membros, transporte, alimentacao, seguroObrigatorio, versao, motivo: 'Homologação #213' };
}

test('A–J | reconciliação financeira com Angular, .NET e SQL Server descartável', async ({ page, browser, baseURL }) => {
  test.skip(process.env['ISSUE213_HOMOLOGACAO_ISOLADA'] !== '1' || !senhaAdmin, 'Exige ambiente descartável e credenciais de teste.');
  expect(baseURL).toBe('https://localhost:4213');
  // Confere que a UI está ligada ao backend local dedicado antes da primeira mutação.
  const swagger = await page.request.get('https://localhost:18444/swagger/v1/swagger.json');
  expect(swagger.status()).toBe(200);
  expect((await swagger.json()).paths['/api/Eventos/{id}/Participantes/{membroId}/Estorno'].post).toBeDefined();
  const token = await entrar(page, emailAdmin, senhaAdmin!);
  const headers = { Authorization: `Bearer ${token}` };
  const api = (method: string, path: string, data?: object, extra?: Record<string, string>) =>
    page.request.fetch('/api' + path, { method, data, headers: { ...headers, ...extra } });
  async function json<T>(resposta: APIResponse, status: number): Promise<T> {
    expect(resposta.status(), new URL(resposta.url()).pathname).toBe(status);
    return resposta.json();
  }
  const perms = await json<{ permissoes: string[] }>(await api('GET', '/Me/Permissoes'), 200);
  expect(perms.permissoes).toEqual(expect.arrayContaining([
    'eventos.consultar', 'eventos.criar', 'eventos.editar', 'eventos.excluir',
    'financeiro.pagamentos.registrar', 'financeiro.lancamentos.consultar',
  ]));
  expect((await page.request.get('/api/Eventos')).status()).toBe(401);

  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const dataFutura = (dias: number) => new Date(Date.UTC(ano, mes - 1, dia + dias)).toISOString().slice(0, 10);
  const marca = randomUUID().slice(0, 8);
  const nome = (letra: string) => `${prefixo} ${marca} ${letra}`;
  const cargos = await json<{ id: string; role: string }[]>(await api('GET', '/Cargos'), 200);
  const cargoId = cargos.find(c => c.role === 'DS')?.id;
  expect(cargoId).toBeDefined();

  async function membro(letra: string) {
    const email = `${letra.toLowerCase()}-${marca}@issue213.test`;
    const senha = `Aa9@${randomUUID()}`;
    const dto = await json<{ id: string }>(await api('POST', '/Usuarios', {
      cargoId, email, senha, nome: nome(letra), cpf: cpfFicticio(), ehCin: true,
    }), 201);
    return { id: dto.id, email, senha };
  }
  const primeiro = await membro('ANA');
  const segundo = await membro('BRUNO');
  const membros = [primeiro.id, segundo.id];
  const dialogo = page.getByRole('dialog');
  const consultar = async (e: EventoDto) => json<EventoDto>(await api('GET', `/Eventos/${e.id}`), 200);
  const lancamento = async (id: string) => json<{ status: string; valor: number; valorPago: number; ativo?: boolean; tipoFluxo: string }>(
    await api('GET', `/Lancamentos/${id}`), 200);

  async function criar(letra: string) {
    const e = await json<EventoDto>(await api('POST', '/Eventos', {
      titulo: nome(letra), descricao: null, dataEvento: dataFutura('ABCDEIJ'.indexOf(letra[0]) + 1),
      local: 'Sede de homologação', membros,
      transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 }, seguroObrigatorio: 100,
    }, { 'Idempotency-Key': randomUUID() }), 201);
    expect(e.lancamentos).toHaveLength(2);
    expect(e.lancamentos.every(l => l.valor === 100 && l.status === 'Pendente')).toBe(true);
    return e;
  }
  async function pagar(e: EventoDto, valorPago: number) {
    const cobranca = e.lancamentos.find(l => l.membroId === primeiro.id)!;
    const pg = await json(await api('POST', `/Lancamentos/${cobranca.id}/Pagamento`, { dataPagamento: hoje, valorPago }), 200);
    expect(pg).toMatchObject({ status: 'Pago', valor: 100, valorPago, tipoFluxo: 'Entrada' });
    return cobranca.id;
  }
  const baixar = (id: string, valorPago: number) =>
    api('POST', `/Lancamentos/${id}/Devolucao`, { dataPagamento: hoje, valorPago });
  const editar = async (e: EventoDto, alteracoes: Partial<EventoDto>) =>
    json<EventoDto>(await api('PUT', `/Eventos/${e.id}`, corpoEdicao(e, alteracoes)), 200);

  async function abrir(e: EventoDto) {
    await page.goto('/eventos');
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();
    await expect(page.getByText('Carregando eventos do período…')).toBeHidden();
    const celula = page.locator(`.fc-day[data-date="${e.dataEvento}"]`);
    if (!(await celula.count())) {
      await page.getByRole('button', { name: 'Próximo mês', exact: true }).click();
      await expect(page.getByText('Carregando eventos do período…')).toBeHidden();
    }
    let item = celula.locator('.fc-daygrid-event').filter({ hasText: e.titulo! });
    if (!(await item.count())) {
      await celula.locator('.fc-daygrid-more-link').click();
      item = page.locator('.fc-popover .fc-event').filter({ hasText: e.titulo! });
    }
    await item.click();
    const botao = page.locator(`.upcoming-card[data-event-id="${e.id}"]`);
    await expect(botao).toHaveAttribute('aria-pressed', 'true');
    await botao.click();
    await expect(dialogo.getByRole('heading', { name: e.titulo!, exact: true })).toBeVisible();
  }

  async function alterarCustoPelaUi(e: EventoDto, valor: number) {
    await abrir(e);
    await dialogo.getByRole('button', { name: 'Editar evento' }).click();
    await dialogo.getByLabel('Seguro (R$)').fill(String(valor));
    await dialogo.getByLabel('Motivo da redução ou zeragem').fill('Homologação #213');
    await dialogo.getByRole('button', { name: 'Revisar evento' }).click();
    await dialogo.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
    const espera = page.waitForResponse(r => r.url().endsWith(`/api/Eventos/${e.id}`) && r.request().method() === 'PUT');
    await dialogo.getByRole('button', { name: 'Confirmar e salvar' }).click();
    const resposta = await espera;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON()).toMatchObject({ versao: e.versao, seguroObrigatorio: valor, motivo: 'Homologação #213' });
    await expect(dialogo.getByText('Devolução · Pendente de processamento').first()).toBeVisible();
    return resposta.json() as Promise<EventoDto>;
  }

  async function prepararEstorno(e: EventoDto) {
    await abrir(e);
    await dialogo.getByRole('button', { name: `Solicitar estorno de ${nome('ANA')}` }).click();
    await dialogo.getByLabel('Motivo do estorno').fill('Homologação #213');
    await dialogo.getByLabel('Confirmo a solicitação de estorno somente deste participante.').check();
  }

  await test.step('A | evento com pagamento integral', async () => {
    const e = await criar('A');
    const origem = await pagar(e, 100);
    const atual = await consultar(e);
    expect(atual.lancamentos.find(l => l.id === origem)).toMatchObject({ status: 'Pago', valor: 100 });
    expect(atual.devolucoes).toEqual([]);
    await abrir(atual);
    await expect(dialogo.getByText(/Valor original da cobrança:.*Pago/)).toBeVisible();
  });

  await test.step('B | redução após pagamento parcial devolve só o excedente pago', async () => {
    const e = await criar('B');
    const origem = await pagar(e, 60);
    const reduzido = await alterarCustoPelaUi(await consultar(e), 40);
    expect(reduzido.devolucoes).toEqual([expect.objectContaining({ membroId: primeiro.id, lancamentoOrigemId: origem, valor: 20, status: 'Pendente' })]);
    expect(await lancamento(origem)).toMatchObject({ valor: 100, valorPago: 60, status: 'Pago' });
    expect((await consultar(e)).devolucoes).toEqual(reduzido.devolucoes);
  });

  await test.step('C | duas reduções, com motivo e sem duplicação de valores', async () => {
    const e = await criar('C');
    const origem = await pagar(e, 100);
    const reduzido = await alterarCustoPelaUi(await consultar(e), 80);
    expect(reduzido.devolucoes).toEqual([expect.objectContaining({ lancamentoOrigemId: origem, valor: 20, status: 'Pendente' })]);
    const novamente = await alterarCustoPelaUi(await consultar(e), 65);
    expect(novamente.devolucoes?.map(d => d.valor).sort((a, b) => a - b)).toEqual([15, 20]);
    expect((await consultar(e)).devolucoes).toHaveLength(2);
    expect(await lancamento(origem)).toMatchObject({ valor: 100, valorPago: 100, status: 'Pago' });
  });

  await test.step('D | zeragem preserva pago e desativa cobrança em aberto', async () => {
    const e = await criar('D');
    const origem = await pagar(e, 100);
    const aberto = e.lancamentos.find(l => l.id !== origem)!;
    const zerado = await alterarCustoPelaUi(await consultar(e), 0);
    expect(zerado).toMatchObject({ valorPorMembro: 0, total: 0 });
    expect(zerado.membros.slice().sort()).toEqual(membros.slice().sort());
    expect(zerado.devolucoes).toEqual([expect.objectContaining({ lancamentoOrigemId: origem, valor: 100, status: 'Pendente' })]);
    expect(zerado.lancamentos.map(l => l.id)).toEqual([origem]);
    expect((await api('GET', `/Lancamentos/${aberto.id}`)).status()).toBe(404);
    expect(await lancamento(origem)).toMatchObject({ valorPago: 100, status: 'Pago' });
  });

  let estornado: EventoDto;
  let origemEstorno: string;
  await test.step('E | estorno individual, escopo do membro e proteção contra novo estorno', async () => {
    const e = await criar('E-F-G-H');
    origemEstorno = await pagar(e, 75);
    const atual = await consultar(e);
    expect(await lancamento(origemEstorno)).toMatchObject({ valorPago: 75, status: 'Pago' });
    expect((await api('PUT', `/Eventos/${e.id}`, corpoEdicao(atual, { membros: [segundo.id] }))).status()).toBe(409);
    expect((await api('DELETE', `/Eventos/${e.id}`, { motivo: 'Homologação', versao: atual.versao })).status()).toBe(409);
    await prepararEstorno(atual);
    const caminho = `/api/Eventos/${e.id}/Participantes/${primeiro.id}/Estorno`;
    const espera = page.waitForResponse(r => r.url().endsWith(caminho) && r.request().method() === 'POST');
    await dialogo.getByRole('button', { name: 'Confirmar estorno' }).click();
    const resposta = await espera;
    expect(resposta.status()).toBe(200);
    expect(resposta.request().postDataJSON()).toEqual({ versao: atual.versao, motivo: 'Homologação #213' });
    estornado = await resposta.json();
    expect(estornado.lancamentos).toEqual(atual.lancamentos);
    expect(estornado.devolucoes).toEqual([expect.objectContaining({ lancamentoOrigemId: origemEstorno, membroId: primeiro.id, valor: 75, status: 'Pendente' })]);
    expect(estornado.valorPorMembro).toBe(100);
    await expect(dialogo.getByText('Devolução · Pendente de processamento')).toBeVisible();
    expect((await api('POST', caminho.slice(4), { versao: estornado.versao, motivo: 'Verificar saldo' })).status()).toBe(409);
    expect((await consultar(e)).devolucoes).toHaveLength(1);
  });

  await test.step('F–H | somente o servidor libera remoção e exclusão após baixa', async () => {
    const e = await consultar(estornado);
    const devolucao = e.devolucoes![0];
    expect((await api('PUT', `/Eventos/${e.id}`, corpoEdicao(e, { membros: [segundo.id] }))).status()).toBe(409);
    expect((await api('DELETE', `/Eventos/${e.id}`, { motivo: 'Homologação', versao: e.versao })).status()).toBe(409);
    expect((await baixar(devolucao.id, 76)).status()).toBe(400);
    expect(await json(await baixar(devolucao.id, 75), 200)).toMatchObject({ tipoFluxo: 'Saida', status: 'Pago', valorPago: 75 });

    const liquidado = await consultar(e);
    expect(liquidado.devolucoes).toEqual([expect.objectContaining({ id: devolucao.id, status: 'Pago', dataDevolucao: hoje, valorDevolvido: 75 })]);
    await abrir(liquidado);
    await expect(dialogo.getByText('Devolução · Concluída')).toBeVisible();
    await dialogo.getByRole('button', { name: 'Editar evento' }).click();
    await dialogo.getByLabel(nome('ANA'), { exact: true }).uncheck();
    await dialogo.getByLabel('Motivo da remoção de participantes').fill('Homologação #213');
    await dialogo.getByRole('button', { name: 'Revisar evento' }).click();
    await dialogo.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
    const put = page.waitForResponse(r => r.url().endsWith(`/api/Eventos/${e.id}`) && r.request().method() === 'PUT');
    await dialogo.getByRole('button', { name: 'Confirmar e salvar' }).click();
    expect((await put).status()).toBe(200);
    await expect(dialogo.getByText(/Removido do evento/)).toBeVisible();
    const removido = await consultar(e);
    expect(removido.membros).toEqual([segundo.id]);
    expect(removido.lancamentos).toContainEqual(expect.objectContaining({ id: origemEstorno, status: 'Pago' }));

    await dialogo.getByRole('button', { name: 'Excluir evento', exact: true }).click();
    await dialogo.getByLabel('Motivo da exclusão').fill('Homologação #213');
    await dialogo.getByLabel(confirmarExclusao).check();
    const del = page.waitForResponse(r => r.url().endsWith(`/api/Eventos/${e.id}`) && r.request().method() === 'DELETE');
    await dialogo.getByRole('button', { name: 'Confirmar exclusão' }).click();
    expect((await del).status()).toBe(204);
    expect((await del).request().postDataJSON()).toMatchObject({ versao: removido.versao });
    await expect(dialogo).toBeHidden();
    await expect(page.locator('.fc-daygrid-event').filter({ hasText: e.titulo! })).toHaveCount(0);
    const lista = await json<{ items: EventoDto[] }>(await api('GET', `/Eventos?dataInicial=${e.dataEvento}&dataFinal=${e.dataEvento}`), 200);
    expect(lista.items.some(item => item.id === e.id)).toBe(false);
    expect((await api('GET', `/Eventos/${e.id}`)).status()).toBe(404);
    expect(await lancamento(origemEstorno)).toMatchObject({ valor: 100, valorPago: 75, status: 'Pago', tipoFluxo: 'Entrada' });
    expect(await lancamento(devolucao.id)).toMatchObject({ valorPago: 75, status: 'Pago', tipoFluxo: 'Saida' });
  });

  await test.step('I | versão obsoleta rejeitada e tela atualizada após consulta', async () => {
    const e = await criar('I');
    await abrir(e);
    await dialogo.getByRole('button', { name: 'Editar evento' }).click();
    await dialogo.getByLabel('Título', { exact: true }).fill(nome('I obsoleto'));
    await dialogo.getByRole('button', { name: 'Revisar evento' }).click();
    const novo = await editar(e, { titulo: nome('I concorrente') });
    expect(novo.versao).not.toBe(e.versao);
    await dialogo.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
    const espera = page.waitForResponse(r => r.url().endsWith(`/api/Eventos/${e.id}`) && r.request().method() === 'PUT');
    await dialogo.getByRole('button', { name: 'Confirmar e salvar' }).click();
    const conflito = await espera;
    expect(conflito.status()).toBe(409);
    expect(conflito.request().postDataJSON().versao).toBe(e.versao);
    await expect(dialogo.getByRole('button', { name: 'Confirmar e salvar' })).toBeDisabled();
    await dialogo.getByRole('button', { name: 'Recarregar dados atuais' }).click();
    await expect(dialogo.getByRole('heading', { name: novo.titulo! })).toBeVisible();
    await expect(page.locator(`.upcoming-card[data-event-id="${e.id}"]`)).toContainText(novo.titulo!);
    expect((await consultar(e)).versao).toBe(novo.versao);
  });

  await test.step('J | resposta de estorno interrompida após commit real e reconciliação sem repetição', async () => {
    const e = await criar('J');
    const origem = await pagar(e, 65);
    const atual = await consultar(e);
    await prepararEstorno(atual);
    const caminho = `/api/Eventos/${e.id}/Participantes/${primeiro.id}/Estorno`;
    let envios = 0;
    let statusServidor = 0;
    await page.route('**' + caminho, async route => {
      envios++;
      const resposta = await route.fetch({ maxRetries: 0 });
      statusServidor = resposta.status();
      await route.abort('connectionreset');
    });
    const confirmar = dialogo.getByRole('button', { name: 'Confirmar estorno' });
    await confirmar.click();
    await expect(dialogo.getByText('O resultado da operação permanece sem confirmação.')).toBeVisible();
    await expect(confirmar).toBeDisabled();
    expect(statusServidor).toBe(200);
    await expect(page.getByText('Solicitação de estorno registrada.', { exact: false })).toHaveCount(0);
    const consulta = page.waitForResponse(r => r.url().endsWith(`/api/Eventos/${e.id}`) && r.request().method() === 'GET');
    await dialogo.getByRole('button', { name: 'Recarregar dados atuais' }).click();
    expect((await consulta).status()).toBe(200);
    await expect(dialogo.getByText('Devolução · Pendente de processamento')).toBeVisible();
    expect((await consultar(e)).devolucoes).toEqual([expect.objectContaining({ lancamentoOrigemId: origem, valor: 65, status: 'Pendente' })]);
    expect(await lancamento(origem)).toMatchObject({ valorPago: 65, status: 'Pago' });
    expect(envios).toBe(1);
    await page.unroute('**' + caminho);
  });

  await test.step('RBAC | perfil de membro não pode executar operações financeiras administrativas', async () => {
    const contexto = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
    try {
      const membroPage = await contexto.newPage();
      const tokenMembro = await entrar(membroPage, primeiro.email, primeiro.senha);
      const auth = { Authorization: `Bearer ${tokenMembro}` };
      const minhaLista = await json<{ items: { titulo: string; minhasDevolucoes: unknown[] }[] }>(
        await membroPage.request.get('/api/Me/Eventos', { headers: auth }), 200);
      expect(minhaLista.items.find(item => item.titulo === nome('J'))?.minhasDevolucoes).toHaveLength(1);
      for (const [metodo, rota] of [
        ['PUT', `/Eventos/${estornado.id}`],
        ['DELETE', `/Eventos/${estornado.id}`],
        ['POST', `/Eventos/${estornado.id}/Participantes/${primeiro.id}/Estorno`],
        ['POST', `/Lancamentos/${estornado.devolucoes![0].id}/Devolucao`],
      ]) {
        expect((await membroPage.request.fetch('/api' + rota, {
          method: metodo, headers: auth, data: { motivo: 'Negação de acesso', versao: estornado.versao },
        })).status()).toBe(403);
      }
    } finally {
      await contexto.close();
    }
  });
  console.log(`Homologação ${marca}: cenários A–J e RBAC concluídos.`);
});
