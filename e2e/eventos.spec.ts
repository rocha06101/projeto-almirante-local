import { expect, Page, test } from '@playwright/test';
import { mockApi, measureOverflow } from './support';
import type { EventoDto } from '../src/app/core/models/evento.model';

const hoje = '2026-11-17';
const m1 = '10000000-0000-4000-8000-000000000001';
const m2 = '10000000-0000-4000-8000-000000000002';
const m3 = '10000000-0000-4000-8000-000000000003';
const permissoes = ['eventos.consultar', 'eventos.criar', 'eventos.editar', 'eventos.excluir', 'membros.consultar'];
const novo = (id: number, dataEvento: string, local: string): EventoDto => ({
  id: `20000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  eventoGrupoId: `30000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
  eventoReferenciaId: null, dataEvento, local, titulo: `Evento — ${local}`, descricao: null,
  membros: [m1, m2], quantidadeMembros: 2,
  transporte: { ehGratis: false, valor: 12.5 }, alimentacao: { individual: false, valor: 10 },
  seguroObrigatorio: 2.5, valorPorMembro: 25, total: 50, versao: 'AAAAAAAABAA=', ativo: true,
  devolucoes: [],
  lancamentos: [m1, m2].map((membroId, i) => ({ id: `${id}-l${i}`, membroId, valor: 25, status: 'Pendente' })),
});

async function preparar(page: Page, permissoesAtuais = permissoes) {
  await page.clock.setFixedTime(new Date('2026-11-17T15:00:00-03:00'));
  await mockApi(page);
  await page.route('**/hubs/notificacoes/negotiate**', r => r.fulfill({ json: {
    negotiateVersion: 1, connectionId: 'test', connectionToken: 'test', availableTransports: [{ transport: 'WebSockets', transferFormats: ['Text', 'Binary'] }],
  } }));
  await page.routeWebSocket('**/hubs/notificacoes**', socket => {
    socket.onMessage(message => { if (String(message).includes('"protocol"')) socket.send('{}\u001e'); });
  });
  await page.route('**/api/Me/Permissoes', r => r.fulfill({ json: { permissoes: permissoesAtuais, versaoAutorizacao: 1, permissoesPorDesignacao: [] } }));
  await page.route('**/api/Membros', r => r.fulfill({ json: [
    { id: m1, nome: 'Ana Silva', cargo: 'Desbravador', role: 'DS' },
    { id: m2, nome: 'Bruno Santos', cargo: 'Tesoureiro', role: 'TES' },
    { id: m3, nome: 'Caio Lima', cargo: 'Desbravador', role: 'DS' },
  ] }));
  const estado = {
    eventos: [novo(1, hoje, 'Igreja'), novo(2, '2026-11-18', 'Acampamento da Serra'), novo(3, '2026-11-22', 'Parque Municipal'), novo(4, '2026-12-08', 'Sede do clube'), novo(5, '2026-11-05', 'Praça Central')],
    chamadas: [] as { method: string; url: URL; body: any; key?: string }[],
    erroLista: 0, erroDetalhe: 0, erroPost: 0, erroPut: 0, erroDelete: 0, erroEstorno: 0, atraso: 0,
    respostaEstorno: null as EventoDto | null, respostaPut: null as EventoDto | null,
  };
  await page.route('**/api/Eventos**', async r => {
    const req = r.request(), url = new URL(req.url()), method = req.method();
    const id = url.pathname.split('/')[3];
    estado.chamadas.push({ method, url, body: req.postDataJSON(), key: req.headers()['idempotency-key'] });
    if (method === 'GET' && !id) {
      if (estado.atraso) await new Promise(resolve => setTimeout(resolve, estado.atraso));
      if (estado.erroLista) return r.fulfill({ status: estado.erroLista, json: { detail: 'Consulta indisponível.' } });
      const dataInicial = url.searchParams.get('dataInicial')!, dataFinal = url.searchParams.get('dataFinal')!;
      return r.fulfill({ json: { items: estado.eventos.filter(e => e.dataEvento >= dataInicial && e.dataEvento <= dataFinal), dataInicial, dataFinal, dataMinimaCadastro: '2026-11-01' } });
    }
    if (method === 'GET') return estado.erroDetalhe ? r.fulfill({ status: estado.erroDetalhe, json: { title: 'Evento não encontrado.' } }) : r.fulfill({ json: estado.eventos.find(e => e.id === id) });
    if (method === 'POST' && url.pathname.endsWith('/Estorno')) {
      if (estado.erroEstorno) return r.fulfill({ status: estado.erroEstorno, json: { detail: 'O membro não tem valor retido; tudo já foi devolvido ou está em devolução.' } });
      if (!estado.respostaEstorno) return r.fulfill({ status: 500, json: { detail: 'Fixture de resposta não configurada.' } });
      estado.eventos[estado.eventos.findIndex(e => e.id === id)] = estado.respostaEstorno;
      return r.fulfill({ json: estado.respostaEstorno });
    }
    if (method === 'POST') {
      if (estado.erroPost) { const status = estado.erroPost; estado.erroPost = 0; return r.fulfill({ status, json: { detail: 'Resposta não confirmada.' } }); }
      const body = req.postDataJSON();
      const e = { ...novo(10, body.dataEvento, body.local), ...body, quantidadeMembros: body.membros.length };
      estado.eventos.push(e);
      return r.fulfill({ status: 201, json: e });
    }
    if (method === 'PUT') {
      if (estado.erroPut) return r.fulfill({ status: estado.erroPut, json: { detail: 'Versão obsoleta. Recarregue os dados.' } });
      const i = estado.eventos.findIndex(e => e.id === id);
      estado.eventos[i] = estado.respostaPut ?? { ...estado.eventos[i], ...req.postDataJSON(), versao: 'AAAAAAAABAE=' };
      return r.fulfill({ json: estado.eventos[i] });
    }
    if (estado.erroDelete) return r.fulfill({ status: estado.erroDelete, json: { detail: 'Exclusão bloqueada.' } });
    estado.eventos = estado.eventos.filter(e => e.id !== id);
    return r.fulfill({ status: 204 });
  });
  return estado;
}
async function abrir(page: Page) {
  await page.goto('/eventos');
  await expect(page.getByRole('heading', { name: 'Eventos', exact: true })).toBeVisible();
  await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();
  await expect(page.getByText('Carregando eventos do período…')).toBeHidden();
}
async function detalhes(page: Page) {
  await page.locator('.upcoming-card').first().click();
  await page.locator('.upcoming-card').first().click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Evento — Igreja' })).toBeVisible();
}
async function preencher(page: Page) {
  await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
  await page.getByLabel('Título', { exact: true }).fill('Trilha na Praia do Sol');
  await page.getByLabel('Descrição', { exact: true }).fill('Saída às 8h\n<b>Levar água.</b>');
  await page.getByLabel('Local', { exact: true }).fill('Praia');
  await page.getByLabel('Desbravadores', { exact: true }).check();
  await page.getByLabel('Caio Lima', { exact: true }).uncheck();
  await page.getByLabel('Seguro', { exact: true }).check();
  await page.getByLabel('Seguro (R$)', { exact: true }).fill('5.25');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await expect(page.getByRole('region', { name: 'Confirmação financeira' })).toBeVisible();
}

for (const width of [320, 768, 1280, 1440]) {
  test(`calendário e detalhes sem overflow em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 320 ? 740 : 900 });
    const erros: string[] = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('console', e => { if (e.type() === 'error') erros.push(e.text()); });
    const estado = await preparar(page);
    await abrir(page);
    await expect(page.locator('.fc-col-header-cell').first()).toHaveText('Seg');
    await expect(page.locator('.fc-day-today')).toHaveAttribute('data-date', hoje);
    await expect(page.locator('.fc-daygrid-event').filter({ hasText: 'Evento — Igreja' })).toBeVisible();
    expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
    await expect.poll(async () => page.locator('.fc').evaluate(el => {
      const domingo = el.querySelector('.fc-col-header-cell:last-child')!.getBoundingClientRect();
      return Math.round(domingo.right - el.getBoundingClientRect().right);
    })).toBeLessThanOrEqual(1);
    await expect(page.locator('.selected-events')).toHaveCount(0);
    if (width >= 1280) {
      await expect(page.locator('.fc')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('app-proximos-eventos')).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath(`eventos-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Novembro', exact: true }).click();
    const painel = page.getByRole('group', { name: 'Selecionar mês' });
    await expect(painel).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: info.outputPath(`seletor-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
    await expect(page.getByLabel('Data', { exact: true })).toHaveValue('2026-11-19');
    await expect(page.getByLabel('Título', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Descrição', { exact: true })).toBeVisible();
    await expect(page.locator('.member-list input')).toHaveCount(0);
    await page.getByLabel('Todos', { exact: true }).check();
    await expect(page.locator('.member-list input:checked')).toHaveCount(3);
    expect(await page.locator('.dialog-body').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`cadastro-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const periodos = estado.chamadas.filter(c => c.method === 'GET' && c.url.pathname === '/api/Eventos' && c.url.searchParams.get('dataInicial') !== c.url.searchParams.get('dataFinal'));
    expect(periodos).toHaveLength(2);
    expect(periodos.map(c => c.url.search)).toEqual(expect.arrayContaining(['?dataInicial=2026-10-26&dataFinal=2026-12-06', '?dataInicial=2026-11-17&dataFinal=2027-11-17']));
    await detalhes(page);
    expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Editar evento' }).click();
    await expect(page.getByLabel('Local', { exact: true })).toHaveValue('Igreja');
    await expect.poll(() => page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
    expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`formulario-${width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    expect(erros).toEqual([]);
  });
}

test('navega meses, volta a hoje, seleciona data e pagina eventos futuros', async ({ page }) => {
  const estado = await preparar(page); await abrir(page);
  await page.getByRole('button', { name: 'Próximo mês', exact: true }).click();
  await expect(page.locator('.month-navigation h2')).toHaveText(/Dezembro\s+de\s+2026/);
  await expect.poll(() => estado.chamadas.some(c => c.url.search === '?dataInicial=2026-11-30&dataFinal=2027-01-03')).toBe(true);
  await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await expect(page.locator('.month-navigation h2')).toHaveText(/Novembro\s+de\s+2026/);
  await expect(page.getByRole('button', { name: 'Atualizar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Novo evento', exact: true })).toHaveCount(0);
  await page.locator('.fc-day[data-date="2026-11-19"]').click({ position: { x: 12, y: 50 } });
  await expect(page.getByLabel('Data', { exact: true })).toHaveValue('2026-11-19');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(page.locator('.selected-day')).toHaveAttribute('data-date', hoje);
  await expect(page.locator('app-proximos-eventos')).not.toContainText('Praça Central');
  await page.getByRole('button', { name: 'Mais eventos' }).click();
  await expect(page.locator('.upcoming-card')).toContainText('Sede do clube');
});

test('cadastro exige confirmação e preserva idempotência após resposta incerta e reabertura', async ({ page }) => {
  const estado = await preparar(page); estado.erroPost = 503; await abrir(page); await preencher(page);
  await expect(page.getByRole('button', { name: 'Confirmar e salvar' })).toBeDisabled();
  expect(estado.chamadas.filter(c => c.method === 'POST')).toHaveLength(0);
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.locator('app-evento-formulario [role=alert]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
  await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Confirmação financeira' })).toContainText('Praia do Sol');
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.upcoming-card').filter({ hasText: 'Praia do Sol' })).toBeVisible();
  const posts = estado.chamadas.filter(c => c.method === 'POST');
  expect(posts).toHaveLength(2); expect(posts[0].key).toMatch(/^[0-9a-f-]{36}$/); expect(posts[1].key).toBe(posts[0].key); expect(posts[1].body).toEqual(posts[0].body);
  expect(posts[0].body).toMatchObject({
    titulo: 'Trilha na Praia do Sol', descricao: 'Saída às 8h\n<b>Levar água.</b>', membros: [m1], seguroObrigatorio: 5.25,
  });
  expect(posts[0].body).not.toHaveProperty('total');
  await expect(page.locator('.fc-daygrid-event').filter({ hasText: 'Praia do Sol' })).toBeVisible();
  await page.locator('.upcoming-card').filter({ hasText: 'Praia do Sol' }).click();
  await page.locator('.upcoming-card').filter({ hasText: 'Praia do Sol' }).click();
  await expect(page.getByRole('heading', { name: 'Trilha na Praia do Sol' })).toBeVisible();
  const descricao = page.locator('.event-description');
  expect(await descricao.textContent()).toBe('Saída às 8h\n<b>Levar água.</b>');
  await expect(descricao).toHaveCSS('white-space', 'pre-wrap');
  await expect(descricao.locator('b')).toHaveCount(0);
});

test('edição mantém versão, exige motivo ao remover membro e recarrega após 409', async ({ page }) => {
  const estado = await preparar(page); await abrir(page); await detalhes(page);
  await page.getByRole('button', { name: 'Editar evento' }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Evento — Igreja');
  await expect(page.getByLabel('Caio Lima', { exact: true })).toHaveCount(0);
  await page.getByLabel('Bruno Santos', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Revisar evento' })).toBeDisabled();
  await page.getByLabel('Motivo da remoção de participantes').fill('Participante cancelou');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  estado.erroPut = 409;
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('button', { name: 'Recarregar dados atuais' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar e salvar' })).toBeDisabled();
  const put = estado.chamadas.find(c => c.method === 'PUT')!;
  expect(put.body.versao).toBe('AAAAAAAABAA='); expect(put.body.motivo).toBe('Participante cancelou'); expect(put.body.membros).toEqual([m1]);
  estado.eventos[0].versao = 'AAAAAAAABAU='; estado.erroPut = 0;
  await page.getByRole('button', { name: 'Recarregar dados atuais' }).click();
  await page.getByRole('button', { name: 'Editar evento' }).click();
  await page.getByLabel('Local', { exact: true }).fill('Igreja Central');
  await page.getByLabel('Título', { exact: true }).fill('Reunião na Igreja Central');
  await page.getByLabel('Descrição', { exact: true }).fill('Abertura\nAtividades');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Reunião na Igreja Central' })).toBeVisible();
  expect(estado.chamadas.filter(c => c.method === 'PUT').at(-1)!.body.versao).toBe('AAAAAAAABAU=');
  await page.keyboard.press('Escape');
  await expect(page.locator('.fc-daygrid-event').filter({ hasText: 'Igreja Central' })).toBeVisible();
  await expect(page.locator('.upcoming-card').filter({ hasText: 'Igreja Central' })).toBeVisible();

});

test('exclusão confirma motivo e versão, atualiza calendário e próximos', async ({ page }) => {
  const estado = await preparar(page); await abrir(page); await detalhes(page);
  await page.getByRole('button', { name: 'Excluir evento', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirmar exclusão' })).toBeDisabled();
  await page.getByLabel('Motivo da exclusão').fill('Evento cancelado');
  await page.getByLabel('Confirmo a exclusão e a desativação das cobranças pendentes.').check();
  await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(estado.chamadas.find(c => c.method === 'DELETE')!.body).toEqual({ motivo: 'Evento cancelado', versao: 'AAAAAAAABAA=' });
  await expect(page.locator('.fc-daygrid-event').filter({ hasText: 'Igreja' })).toHaveCount(0);
  await expect(page.locator('.upcoming-card').filter({ hasText: 'Igreja' })).toHaveCount(0);
});

test('bloqueios financeiros e grupos preservam cadastros individuais', async ({ page }) => {
  const estado = await preparar(page);
  estado.eventos[0].lancamentos[0].status = 'Pago';
  const outro = novo(6, hoje, 'Igreja'); outro.eventoGrupoId = estado.eventos[0].eventoGrupoId; outro.eventoReferenciaId = estado.eventos[0].id; estado.eventos.push(outro);
  await abrir(page); await detalhes(page);
  await expect(page.getByRole('button', { name: 'Excluir evento', exact: true })).toBeDisabled();
  await expect(page.getByText('Cadastros do mesmo passeio', { exact: true })).toBeVisible();
  await expect(page.locator('.total')).toContainText('50,00');
  await page.getByRole('button', { name: 'Editar evento' }).click();
  for (const label of ['Data', 'Local']) await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
  for (const label of ['Seguro', 'Seguro (R$)']) await expect(page.getByLabel(label, { exact: true })).toBeEnabled();
});

test('seleção em massa, exceções manuais e custos independentes no cadastro', async ({ page }) => {
  const estado = await preparar(page);
  await abrir(page);
  await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
  const todos = page.getByLabel('Todos', { exact: true });
  const diretoria = page.getByLabel('Diretoria', { exact: true });
  const desbravadores = page.getByLabel('Desbravadores', { exact: true });
  const ana = page.getByLabel('Ana Silva', { exact: true });
  const bruno = page.getByLabel('Bruno Santos', { exact: true });
  await expect(ana).toHaveCount(0);
  await expect(todos).not.toBeChecked();
  await todos.check();
  await expect(diretoria).toBeChecked();
  await expect(desbravadores).toBeChecked();
  await ana.uncheck();
  await expect(todos).toHaveJSProperty('indeterminate', true);
  await diretoria.uncheck();
  await expect(bruno).toHaveCount(0);
  await diretoria.check();
  await expect(bruno).toBeChecked();
  await expect(ana).not.toBeChecked();
  await expect(page.getByLabel('Caio Lima', { exact: true })).toBeChecked();

  const seguro = page.getByLabel('Seguro', { exact: true });
  const valorSeguro = page.getByLabel('Seguro (R$)', { exact: true });
  await expect(seguro).not.toBeChecked();
  await expect(valorSeguro).toBeDisabled();
  await seguro.check();
  await valorSeguro.fill('18');
  await seguro.uncheck();
  await page.getByLabel('Alimentação', { exact: true }).check();
  await page.getByLabel('Alimentação (R$)', { exact: true }).fill('12');
  await expect(page.getByLabel('Transporte (R$)', { exact: true })).toBeDisabled();
  await page.getByLabel('Transporte', { exact: true }).check();
  await page.getByLabel('Transporte (R$)', { exact: true }).fill('7');
  await page.getByLabel('Local', { exact: true }).fill('Salão');
  await expect(page.getByRole('button', { name: 'Revisar evento' })).toBeDisabled();
  await page.getByLabel('Título', { exact: true }).fill('Encontro');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(estado.chamadas.find(c => c.method === 'POST')?.body).toMatchObject({
    titulo: 'Encontro', descricao: null, membros: [m2, m3], seguroObrigatorio: 0,
    transporte: { ehGratis: false, valor: 7 }, alimentacao: { individual: false, valor: 12 },
  });
});

test('consulta sem permissões de escrita oculta ações', async ({ page }) => {
  await preparar(page, ['eventos.consultar']); await abrir(page);
  await expect(page.getByRole('button', { name: 'Novo evento' })).toHaveCount(0);
  for (const dia of [19, 20]) {
    const botao = page.getByRole('button', { name: `${dia} de novembro de 2026`, exact: true });
    await botao.click();
    await expect(botao.locator('span')).toHaveCSS('background-color', 'rgb(52, 64, 157)');
    await expect(page.locator('.day-button[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.locator('.day-button[aria-current="date"]')).toHaveAttribute('aria-pressed', 'false');
  await detalhes(page);
  await expect(page.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Excluir evento', exact: true })).toHaveCount(0);
});

test('evento do calendário abre por teclado e devolve foco ao fechar', async ({ page }) => {
  await preparar(page); await abrir(page);
  const evento = page.locator('.fc-daygrid-event').filter({ hasText: 'Evento — Igreja' });
  await evento.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Evento — Igreja' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden(); await expect(evento).toBeFocused();
});

test('rota nega acesso sem eventos.consultar antes de consultar a API', async ({ page }) => {
  const estado = await preparar(page, ['membros.consultar']);
  await page.goto('/eventos');
  await expect(page).toHaveURL(/\/perfil$/);
  expect(estado.chamadas).toHaveLength(0);
  await expect(page.locator('app-eventos')).toHaveCount(0);
});

test('erro, carregamento e vazio são estados diferentes; detalhes tratam 404', async ({ page }) => {
  const estado = await preparar(page); estado.erroLista = 500; estado.atraso = 400;
  await page.goto('/eventos'); await expect(page.getByText('Carregando eventos do período…')).toBeVisible();
  await expect(page.locator('.calendar-column [role=alert]')).toBeVisible();
  await expect(page.getByText('Nenhum evento neste período.')).toHaveCount(0);
  estado.erroLista = 0; estado.atraso = 0; estado.eventos = [];
  await page.locator('.calendar-column').getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhum evento neste período.')).toBeVisible();
  await expect(page.getByText('Nenhum evento nos próximos 366 dias.')).toBeVisible();
  estado.eventos = [novo(1, hoje, 'Igreja')]; await page.reload();
  estado.erroDetalhe = 404; await page.locator('.upcoming-card').first().click(); await page.locator('.upcoming-card').first().click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Evento não encontrado');
});


test('seletores independentes navegam por mês, ano e faixas', async ({ page }) => {
  const estado = await preparar(page);
  await abrir(page);
  const mes = page.getByRole('button', { name: 'Novembro', exact: true });
  await mes.click();
  await page.getByRole('group', { name: 'Selecionar mês' }).getByRole('button', { name: 'Março', exact: true }).click();
  await expect(page.locator('.period-popover')).toHaveCount(0);
  await page.getByRole('button', { name: '2026', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima faixa de anos' }).click();
  await page.getByRole('button', { name: 'Faixa de anos anterior' }).click();
  await page.getByRole('button', { name: '2028', exact: true }).click();
  await expect(page.locator('.period-picker h2')).toHaveText(/Março\s+de\s+2028/);
  await expect.poll(() => estado.chamadas.filter(c => c.method === 'GET' && c.url.pathname === '/api/Eventos').length).toBe(4);
  const marco = page.getByRole('button', { name: 'Março', exact: true });
  await marco.click();
  await page.keyboard.press('Escape');
  await expect(marco).toBeFocused();
  await expect(page.locator('.period-popover')).toHaveCount(0);
  await marco.click();
  await page.getByRole('heading', { name: 'Eventos', exact: true }).click();
  await expect(page.locator('.period-popover')).toHaveCount(0);
});

test('seleção pelo ID sincroniza calendário e lista sem consultas até o segundo clique', async ({ page }) => {
  const estado = await preparar(page);
  estado.eventos[1] = { ...estado.eventos[1], titulo: estado.eventos[0].titulo };
  await abrir(page);
  const calendario = page.locator('.fc-day[data-date="2026-11-17"] .fc-daygrid-event');
  const lateral = page.locator('.upcoming-card').first();
  const consultas = estado.chamadas.length;
  await expect(calendario).toHaveText('Evento — Igreja');
  await expect(calendario).not.toContainText('participantes');
  await expect(lateral).toContainText('2 participantes');
  await calendario.click();
  await expect(lateral).toHaveAttribute('aria-pressed', 'true');
  await expect(calendario).toHaveClass(/selected-event/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const outro = page.locator('.upcoming-card').nth(1);
  await outro.click();
  await expect(lateral).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.fc-day[data-date="2026-11-18"] .fc-daygrid-event')).toHaveClass(/selected-event/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(estado.chamadas).toHaveLength(consultas);
  await calendario.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await lateral.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.facts')).toContainText('Participantes2');
  expect(estado.chamadas.filter(c => c.url.pathname === `/api/Eventos/${estado.eventos[0].id}`)).toHaveLength(1);
  await page.getByRole('heading', { name: 'Detalhes do evento' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.locator('.backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(lateral).toBeFocused();
  await expect(lateral).toHaveAttribute('aria-pressed', 'true');
  expect(estado.chamadas.every(c => c.method === 'GET')).toBe(true);
});

test('evento passado ausente da lista abre normalmente; dia vazio e navegação limpam seleção', async ({ page }) => {
  await preparar(page); await abrir(page);
  const passado = page.locator('.fc-daygrid-event').filter({ hasText: 'Praça Central' });
  await passado.click();
  await expect(passado).toHaveClass(/selected-event/);
  await expect(page.locator('.upcoming-card[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('.upcoming-card')).toHaveCount(3);
  await passado.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Evento — Praça Central' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
  await expect(page.locator('.selected-event')).toHaveCount(0);
  await page.locator('.backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await passado.click();
  await page.getByRole('button', { name: 'Próximo mês', exact: true }).click();
  await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await passado.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('seleção localiza próxima página e rola apenas a lista lateral', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const estado = await preparar(page);
  estado.eventos.push(...[6, 7, 8, 9, 10].map(id => novo(id, `2026-11-${19 + id}`, 'Local '.repeat(35))));
  await abrir(page);
  const scroll = await page.evaluate(() => scrollY);
  const evento = page.locator('.fc-day[data-date="2026-11-27"] .fc-daygrid-event');
  await evento.click();
  const card = page.locator('.upcoming-card[aria-pressed="true"]');
  await expect(card).toHaveAttribute('data-event-id', estado.eventos.find(e => e.dataEvento === '2026-11-27')!.id);
  await expect(card).toBeInViewport();
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const edicao of [false, true]) {
  test(`${edicao ? 'edição' : 'criação'} protege alterações no backdrop, Escape e cancelar`, async ({ page }) => {
    const estado = await preparar(page); await abrir(page);
    if (edicao) {
      await detalhes(page); await page.getByRole('button', { name: 'Editar evento', exact: true }).click();
    } else await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
    await page.getByLabel('Título', { exact: true }).fill('Título ainda não salvo');
    await page.getByLabel('Descrição', { exact: true }).fill('Descrição preservada');
    await page.getByLabel('Local', { exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.backdrop').click({ position: { x: 2, y: 2 } });
    await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continuar editando' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Título ainda não salvo');
    await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue('Descrição preservada');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Título ainda não salvo');
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await page.locator('.backdrop').click({ position: { x: 2, y: 2 } });
    await page.getByRole('button', { name: 'Descartar alterações', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(estado.chamadas.every(c => c.method === 'GET')).toBe(true);
  });
}

test('edição intacta fecha pelo backdrop; Escape fecha primeiro o seletor nativo', async ({ page }) => {
  await preparar(page); await abrir(page); await detalhes(page);
  await page.getByRole('button', { name: 'Editar evento', exact: true }).click();
  await expect(page.getByLabel('Título', { exact: true })).toHaveValue('Evento — Igreja');
  await page.locator('.backdrop').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '19 de novembro de 2026', exact: true }).click();
  const data = page.getByLabel('Data', { exact: true });
  const caixa = await data.boundingBox();
  await data.click({ position: { x: caixa!.width - 16, y: caixa!.height / 2 } });
  await expect(data).toHaveJSProperty('type', 'date');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('título completo e participantes preservados no evento de 21/11/2026', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const estado = await preparar(page);
  estado.eventos.push({ ...novo(21, '2026-11-21', 'Sede'), titulo: 'reunião de diretoria', quantidadeMembros: 15 });
  estado.eventos.push({ ...novo(22, '2026-11-22', 'Sede'), titulo: 'Evento com título muito extenso para verificar o truncamento com reticências dentro dos limites da célula do calendário' });
  await abrir(page);
  const evento = page.locator('.fc-day[data-date="2026-11-21"] .fc-daygrid-event');
  await expect(evento).toHaveText('reunião de diretoria');
  await evento.click();
  const lateral = page.locator('.upcoming-card[aria-pressed="true"]');
  await expect(lateral).toContainText('15 participantes');
  await expect(lateral).toHaveCSS('border-right-color', 'rgb(52, 64, 157)');
  const titulo = page.locator('.calendar-event strong').filter({ hasText: 'Evento com título muito extenso' });
  await expect(titulo).toHaveCSS('text-overflow', 'ellipsis');
  expect(await titulo.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('selecao-1440x900.png'), fullPage: true });
  await evento.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'reunião de diretoria' })).toBeVisible();
  await expect(page.locator('.facts')).toContainText('Participantes15');
});


test('dias com vários eventos continuam consultáveis pelo popover do calendário', async ({ page }) => {
  const estado = await preparar(page);
  estado.eventos.push(novo(31, hoje, 'Passeio A'), novo(32, hoje, 'Passeio B'));
  await abrir(page);
  await page.locator(`.fc-day[data-date="${hoje}"] .fc-daygrid-more-link`).click();
  const card = page.locator('.fc-popover .fc-event').filter({ hasText: 'Passeio B' });
  await card.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.upcoming-card[aria-pressed="true"]')).toContainText('Passeio B');
  await card.click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Evento — Passeio B' })).toBeVisible();
});

// Fixtures da resposta documentada no Swagger local e na develop da #209; nenhum cálculo financeiro no mock.
const devolucaoConfirmada = {
  id: '40000000-0000-4000-8000-000000000001', membroId: m1, lancamentoOrigemId: '1-l0',
  valor: 25, vencimento: hoje, status: 'Pendente' as const, valorDevolvido: null, dataDevolucao: null,
  motivo: 'Patrocínio', justificativa: null,
};
for (const width of [390, 1280]) {
  test(`estorno individual acessível e sem overflow em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const estado = await preparar(page); estado.eventos[0].lancamentos[0].status = 'Pago';
    estado.respostaEstorno = { ...structuredClone(estado.eventos[0]), versao: 'AAAAAAAABAE=', devolucoes: [devolucaoConfirmada] };
    await abrir(page); await detalhes(page);
    const acao = page.getByRole('button', { name: 'Solicitar estorno de Ana Silva' });
    await acao.focus(); await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toContainText('Ana Silva');
    await expect(page.getByRole('dialog')).toContainText('Evento — Igreja');
    await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toBeDisabled();
    await page.getByRole('button', { name: 'Voltar aos detalhes' }).click(); await expect(acao).toBeFocused();
    await acao.click(); await page.getByLabel('Motivo do estorno').fill('Cancelamento');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Descartar alterações?' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await page.getByLabel('Confirmo a solicitação de estorno somente deste participante.').check();
    expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
    await page.getByRole('button', { name: 'Confirmar estorno' }).click();
    await expect(page.getByRole('dialog')).toContainText('Devolução · Pendente de processamento');
    const posts = estado.chamadas.filter(c => c.method === 'POST'); expect(posts).toHaveLength(1);
    expect(posts[0].url.pathname).toBe(`/api/Eventos/${estado.eventos[0].id}/Participantes/${m1}/Estorno`);
    expect(posts[0].body).toEqual({ motivo: 'Cancelamento', versao: 'AAAAAAAABAA=' });
    expect(estado.eventos[0].valorPorMembro).toBe(25); expect(estado.eventos[0].membros).toEqual([m1, m2]);
    await expect(page.getByText('Solicitação de estorno registrada. A devolução aguarda processamento pela tesouraria.')).toBeVisible();
  });
}
test('zeragem com pagamento exige motivo, revisa efeitos e exibe a resposta confirmada', async ({ page }) => {
  const estado = await preparar(page); estado.eventos[0].lancamentos[0].status = 'Pago';
  const original = structuredClone(estado.eventos[0].lancamentos[0]);
  estado.respostaPut = { ...structuredClone(estado.eventos[0]), transporte: { ehGratis: true, valor: 0 },
    alimentacao: { individual: true, valor: 0 }, seguroObrigatorio: 0, valorPorMembro: 0, total: 0,
    versao: 'AAAAAAAABAE=', lancamentos: [original], devolucoes: [devolucaoConfirmada] };
  await abrir(page); await detalhes(page); await page.getByRole('button', { name: 'Editar evento' }).click();
  await page.getByLabel('Transporte', { exact: true }).uncheck();
  await page.getByLabel('Alimentação', { exact: true }).uncheck();
  await page.getByLabel('Seguro', { exact: true }).uncheck();
  await expect(page.getByRole('button', { name: 'Revisar evento' })).toBeDisabled();
  await page.getByLabel('Motivo da redução ou zeragem').fill('Patrocínio');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await expect(page.getByRole('region', { name: 'Confirmação financeira' })).toContainText('Valor por participante anterior → novo');
  await expect(page.getByRole('region', { name: 'Confirmação financeira' })).toContainText('geradas pendentes');
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByRole('dialog')).toContainText('Devolução · Pendente de processamento');
  await expect(page.locator('.total')).toContainText('0,00');
  const put = estado.chamadas.find(c => c.method === 'PUT')!;
  expect(put.body).toMatchObject({ motivo: 'Patrocínio', seguroObrigatorio: 0, versao: 'AAAAAAAABAA=' });
  expect(put.body).not.toHaveProperty('lancamentos'); expect(estado.eventos[0].lancamentos).toEqual([original]);
  await page.keyboard.press('Escape');
  const aposPut = estado.chamadas.slice(estado.chamadas.indexOf(put) + 1);
  expect(aposPut.filter(c => c.method === 'GET' && c.url.pathname === '/api/Eventos').length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.upcoming-card').first()).toContainText('2 participantes');
});
test('409 de estorno informa ausência de valor retido e impede reenvio', async ({ page }) => {
  const estado = await preparar(page); estado.eventos[0].lancamentos[0].status = 'Pago'; estado.erroEstorno = 409;
  await abrir(page); await detalhes(page); await page.getByRole('button', { name: 'Solicitar estorno de Ana Silva' }).click();
  await page.getByLabel('Motivo do estorno').fill('Cancelamento');
  await page.getByLabel('Confirmo a solicitação de estorno somente deste participante.').check();
  await page.getByRole('button', { name: 'Confirmar estorno' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('não tem valor retido');
  await expect(page.getByRole('button', { name: 'Confirmar estorno' })).toBeDisabled();
  expect(estado.chamadas.filter(c => c.method === 'POST')).toHaveLength(1);
});

test('seleção parcial preserva pagante e anuncia as alterações bloqueadas no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const estado = await preparar(page);
  estado.eventos[0].dataEvento = '2026-11-18';
  estado.eventos[0].lancamentos[0].status = 'Pago';
  await abrir(page); await detalhes(page);
  await page.getByRole('button', { name: 'Editar evento' }).click();
  const grupo = page.getByLabel('Todos', { exact: true });
  const ana = page.getByLabel('Ana Silva', { exact: true });
  const bruno = page.getByLabel('Bruno Santos', { exact: true });
  await expect(grupo).toHaveJSProperty('indeterminate', true);
  await expect(ana).toBeDisabled();
  await expect(ana).toHaveAccessibleDescription('A remoção antes do evento exige que a tesouraria conclua o estorno.');
  await grupo.focus();
  await page.keyboard.press('Space');
  await expect(grupo).toHaveJSProperty('indeterminate', true);
  await expect(ana).toBeChecked();
  await expect(bruno).not.toBeChecked();
  const status = page.getByRole('status').filter({ hasText: '1 participante não foi removido' });
  await expect(status).toHaveAttribute('aria-live', 'polite');
  await bruno.check();
  await expect(status).toHaveCount(0);
  await expect(bruno).toBeChecked();
  expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
});

test('reconciliação de PUT não recarrega listas com GET falho e só atualiza após ler o recurso', async ({ page }) => {
  const estado = await preparar(page);
  await abrir(page); await detalhes(page);
  await page.getByRole('button', { name: 'Editar evento' }).click();
  await page.getByLabel('Título', { exact: true }).fill('Título persistido');
  await page.getByRole('button', { name: 'Revisar evento' }).click();
  await page.getByLabel('Confirmo a operação e seus efeitos nas cobranças.').check();
  estado.erroPut = 500;
  await page.getByRole('button', { name: 'Confirmar e salvar' }).click();
  await expect(page.getByText('O resultado da edição não foi confirmado.')).toBeVisible();
  const consultasLista = () => estado.chamadas.filter(c => c.method === 'GET' && c.url.pathname === '/api/Eventos').length;
  const antes = consultasLista();
  estado.erroDetalhe = 503;
  await page.getByRole('button', { name: 'Recarregar dados atuais' }).click();
  await expect(page.getByText('O resultado da operação permanece sem confirmação.')).toBeVisible();
  expect(consultasLista()).toBe(antes);
  await expect(page.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
  estado.erroDetalhe = 0;
  estado.eventos[0].titulo = 'Título persistido';
  estado.eventos[0].versao = 'AAAAAAAABAE=';
  await page.getByRole('button', { name: 'Recarregar dados atuais' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Título persistido' })).toBeVisible();
  expect(estado.chamadas.filter(c => c.method === 'PUT')).toHaveLength(1);
  await expect(page.getByText('Evento atualizado.', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.upcoming-card').filter({ hasText: 'Título persistido' })).toBeVisible();
  await expect(page.locator('.fc-daygrid-event').filter({ hasText: 'Título persistido' })).toBeVisible();
});
