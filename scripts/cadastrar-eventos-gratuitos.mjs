import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { chromium, request, expect } from '@playwright/test';
import { prepararEventos, cadastrar, novoResumo } from './eventos-gratuitos/cadastro.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://localhost:4216';
const BACKEND = 'https://localhost:8444';
const ajuda = `Cadastro manual de 12 eventos gratuitos (novembro/dezembro de 2026).

NODE_ENV=development SEED_EVENTOS_MEMBROS=<UUID-de-teste> npm run seed:eventos

Backend de desenvolvimento obrigatório: ${BACKEND} (sem fallback remoto).
O script inicia seu próprio Angular em ${ORIGIN}, abre o login existente,
consulta permissões/membros/eventos e cadastra somente os eventos ausentes.
Faça login na janela aberta ou defina SEED_EVENTOS_EMAIL e SEED_EVENTOS_SENHA
no ambiente para execução headless. Credenciais e cookies não são gravados.
IDs separados por vírgula; nomes devem identificar membros de teste/homologação.
Reexecuções devem usar a mesma conta e os mesmos participantes.
Não executar contra uma base de produção, mesmo exposta em localhost.
`;

async function portaLivre() {
  await new Promise((resolve, reject) => {
    const socket = createServer();
    socket.once('error', () => reject(new Error('Porta 4216 ocupada; o script não reutiliza servidores existentes.')));
    socket.listen(4216, 'localhost', () => socket.close(resolve));
  });
}

async function verificarTela(page, eventos, items) {
  await page.goto(`${ORIGIN}/eventos`);
  const calendario = page.locator('app-eventos-calendario');
  await expect(calendario).toBeVisible();
  await page.waitForFunction(() => window.ng?.getComponent(document.querySelector('app-eventos')));
  const ano = calendario.locator('.period-picker h2 button').nth(1);
  if ((await ano.innerText()) !== '2026') {
    await ano.click();
    await page.getByRole('group', { name: 'Selecionar ano' }).getByRole('button', { name: '2026', exact: true }).click();
  }
  await calendario.locator('.period-picker h2 button').first().click();
  await page.getByRole('group', { name: 'Selecionar mês' }).getByRole('button', { name: 'Novembro', exact: true }).click();
  const dialogo = page.getByRole('dialog');
  for (const mes of ['11', '12']) {
    if (mes === '12') await page.getByRole('button', { name: 'Próximo mês', exact: true }).click();
    await expect(calendario.locator('.period-picker h2')).toContainText(mes === '11' ? 'Novembro' : 'Dezembro');
    for (const evento of eventos.filter(e => e.dataEvento.slice(5, 7) === mes)) {
      const celula = calendario.locator(`[data-date="${evento.dataEvento}"]`);
      const rotulo = celula.locator('.calendar-event').filter({ hasText: evento.titulo });
      // FullCalendar pode ocultar eventos excedentes atrás de "+N".
      if (!(await rotulo.isVisible())) {
        await expect.poll(async () => await rotulo.isVisible() || await celula.locator('.fc-daygrid-more-link').isVisible()).toBe(true);
        if (!(await rotulo.isVisible())) await celula.locator('.fc-daygrid-more-link').click();
      }
      const alvo = await rotulo.isVisible() ? rotulo : calendario.locator('.fc-popover .calendar-event').filter({ hasText: evento.titulo });
      await expect(alvo).toBeVisible();
      await alvo.click();
      if (!(await dialogo.isVisible())) await alvo.click(); // Primeiro seleciona, segundo abre detalhes.
      await expect(dialogo.getByRole('heading', { name: evento.titulo, exact: true })).toBeVisible();
      await expect(dialogo.locator('.facts')).toContainText(evento.local);
      await expect(dialogo.locator('.total')).toHaveText(/Total deste cadastro\s*R\$\s*0,00/);
      await expect(dialogo.locator('.facts')).toContainText(/Custo por participante\s*R\$\s*0,00/);
      await expect(dialogo.getByRole('alert')).toHaveCount(0);
      await page.getByRole('button', { name: 'Fechar detalhes', exact: true }).click();
      const fecharPopover = calendario.locator('.fc-popover-close');
      if (await fecharPopover.isVisible()) await fecharPopover.click();
    }
  }
  await page.getByRole('button', { name: 'Mês anterior', exact: true }).click();
  await expect(calendario.locator('.period-picker h2')).toContainText('Novembro');

  // Reload restaura a paginação lateral; não altera datas nem injeta dados na UI.
  await page.reload();
  const proximos = page.locator('app-proximos-eventos');
  await expect(proximos.locator('aside')).toHaveAttribute('aria-busy', 'false');
  const hoje = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE').format(new Date()));
  const esperados = eventos.filter(e => e.dataEvento >= hoje);
  const encontrados = new Set();
  for (let pagina = 0; pagina < 1000; pagina++) {
    for (const e of esperados) {
      const id = items.find(item => item.titulo === e.titulo && item.dataEvento === e.dataEvento).id;
      const card = proximos.locator(`[data-event-id="${id}"]`);
      if (await card.count()) {
        await expect(card).toContainText(e.titulo);
        await expect(card).toContainText(e.local);
        encontrados.add(id);
      }
    }
    const mais = proximos.getByRole('button', { name: 'Mais eventos', exact: true });
    if (!(await mais.count()) || await mais.isDisabled()) break;
    const paginacao = proximos.locator('nav span');
    const paginaAnterior = await paginacao.innerText();
    await mais.click();
    await expect(paginacao).not.toHaveText(paginaAnterior);
  }
  assert.equal(encontrados.size, esperados.length, 'Eventos futuros ausentes da listagem lateral.');
  console.log(`UI: 12 datas/títulos/locais/modais/valores verificados; navegação novembro ↔ dezembro; ${encontrados.size} próximos eventos.`);
}

async function main() {
  if (process.argv.includes('--help')) { console.log(ajuda); return; }
  assert.equal(process.argv.length, 2, 'Argumento desconhecido. Use --help.');
  assert.equal(process.env.NODE_ENV, 'development', 'Exige NODE_ENV=development. Nenhuma chamada foi enviada.');
  const membros = (process.env.SEED_EVENTOS_MEMBROS ?? '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
  const eventos = prepararEventos(membros);
  const resumo = novoResumo(eventos);
  let browser, probe, server, temporario;
  let falha;
  try {
    await portaLivre();
    probe = await request.newContext({ ignoreHTTPSErrors: true, timeout: 10_000 });
    const swagger = await probe.get(`${BACKEND}/swagger/v1/swagger.json`, { maxRedirects: 0 });
    assert.equal(swagger.status(), 200, 'Swagger do backend local indisponível.');
    const schema = await swagger.json();
    assert(schema.components?.schemas?.RegistrarEventoRequest?.properties?.titulo &&
      schema.components?.schemas?.EventoDto?.properties?.descricao, 'Backend não suporta título/descrição.');
    assert(schema.paths?.['/api/Eventos']?.post?.description?.includes('nenhum lançamento é gerado'),
      'API não declara suporte a eventos sem cobranças; cadastro bloqueado.');

    temporario = await mkdtemp(join(tmpdir(), 'almirante-eventos-'));
    const proxy = join(temporario, 'proxy.json');
    await writeFile(proxy, JSON.stringify(Object.fromEntries(['/api', '/hubs'].map(path =>
      [path, { target: BACKEND, secure: false, changeOrigin: true, ws: path === '/hubs' }]))));
    // Não utiliza proxy.conf.mjs nem aceita URL remota via argumentos/ambiente.
    const serverEnv = { ...process.env };
    delete serverEnv.SEED_EVENTOS_EMAIL;
    delete serverEnv.SEED_EVENTOS_SENHA;
    server = spawn(process.execPath, ['node_modules/@angular/cli/bin/ng.js', 'serve',
      '--configuration', 'development', '--host', 'localhost', '--port', '4216', '--ssl', '--proxy-config', proxy],
    { cwd: ROOT, env: serverEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = '', erroServidor;
    server.on('error', erro => { erroServidor = erro; });
    for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { log = (log + data).slice(-6000); });
    console.log('Iniciando Angular development com proxy exclusivo para https://localhost:8444…');
    let pronto = false;
    for (let tentativa = 0; tentativa < 180; tentativa++) {
      if (erroServidor || server.exitCode !== null) throw new Error(`Angular não iniciou: ${erroServidor?.message ?? log}`);
      try { pronto = (await probe.get(ORIGIN, { timeout: 1000, maxRedirects: 0 })).status() === 200; } catch { /* aguarda compilação */ }
      if (pronto) break;
      if (tentativa > 0 && tentativa % 30 === 0) console.log('Aguardando compilação do Angular…');
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(pronto, 'Timeout ao iniciar Angular.');
    const email = process.env.SEED_EVENTOS_EMAIL;
    const senha = process.env.SEED_EVENTOS_SENHA;
    assert(Boolean(email) === Boolean(senha), 'Defina email e senha juntos, ou faça login na janela.');
    browser = await chromium.launch({ headless: Boolean(email) });
    const context = await browser.newContext({ ignoreHTTPSErrors: true, timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    await page.goto(`${ORIGIN}/login`);
    assert(await page.evaluate(() => typeof window.ng?.getComponent === 'function'), 'Frontend não está em modo de desenvolvimento.');
    const loginResponse = page.waitForResponse(r => r.url() === `${ORIGIN}/api/Auth/login` && r.request().method() === 'POST', { timeout: 180_000 });
    // A UI usa AuthService: CSRF, cookie HttpOnly, perfil e permissões existentes.
    // A senha não vai para argumentos de processo, logs ou storageState.
    if (email) {
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Senha', { exact: true }).fill(senha);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    } else console.log('Faça login com a conta de desenvolvimento na janela aberta (até 3 minutos).');
    const login = await loginResponse;
    assert.equal(login.status(), 200, `Login recusado: HTTP ${login.status()}.`);
    let token = (await login.json()).token?.accessToken;
    assert(typeof token === 'string' && token.length > 0, 'Login não retornou accessToken.');
    await expect(page).not.toHaveURL(/\/login$/);
    const api = async (method, path, data, extra = {}) => {
      assert(method === 'GET' || (method === 'POST' && path === '/Eventos'), 'Operação fora do escopo.');
      assert(path.startsWith('/') && !path.startsWith('//'), 'Caminho inválido.');
      const response = await context.request.fetch(`${ORIGIN}/api${path}`, {
        method, data, headers: { Authorization: `Bearer ${token}`, ...extra }, maxRedirects: 0, timeout: 30_000,
      });
      const status = response.status();
      const body = await response.json().catch(() => null);
      if (!(method === 'POST' ? [200, 201] : [200]).includes(status)) {
        // Só expõe o código estruturado. Não imprime headers, tokens ou corpos arbitrários.
        const codigo = typeof body?.codigo === 'string' && /^[A-Z_]+$/.test(body.codigo) ? ` (${body.codigo})` : '';
        throw new Error(`${method} ${path}: HTTP ${status}${codigo}. Interrompido; consulte o estado antes de reexecutar com a mesma conta/chave.`);
      }
      assert(body && typeof body === 'object', `${method} ${path}: JSON inválido.`);
      return { status, body };
    };
    const items = await cadastrar(api, eventos, resumo);
    console.log('Persistência: 12 eventos gratuitos, lançamentos vazios e eventos anteriores preservados.');
    const repeticao = novoResumo(eventos);
    await cadastrar(api, eventos, repeticao);
    assert(repeticao.every(r => r.situacao === 'existente' && r.verificado), 'Repetição criou eventos ou falhou.');
    console.log('Repetição: 0 criados, 12 existentes, sem duplicações.');
    // API do cadastro não será usada depois disto. Navegação usa refresh/interceptors da própria SPA.
    token = null;
    await verificarTela(page, eventos, items);
  } catch (erro) {
    falha = erro;
    process.exitCode = 1;
    console.error(`Bloqueio/falha: ${erro.message}`);
  } finally {
    for (const linha of resumo) if (linha.situacao === 'pendente') linha.situacao = 'não executado';
    console.table(resumo);
    console.log(`Resumo: ${resumo.filter(r => r.situacao === 'criado').length} criados; ${resumo.filter(r => r.situacao === 'existente').length} existentes; ${resumo.filter(r => r.falha || r.situacao === 'falha').length} com falha individual; ${resumo.filter(r => r.situacao === 'não executado').length} não executados. Validação geral: ${falha ? 'FALHOU' : 'OK'}.`);
    await browser?.close();
    await probe?.dispose();
    if (server && server.exitCode === null) {
      await new Promise(resolve => {
        const timer = setTimeout(() => server.kill('SIGKILL'), 5000);
        server.once('exit', () => { clearTimeout(timer); resolve(); });
        server.kill('SIGTERM');
      });
    }
    if (temporario) await rm(temporario, { recursive: true, force: true });
  }
}

main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
