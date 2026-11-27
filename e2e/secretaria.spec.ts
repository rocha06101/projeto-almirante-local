import { readFile } from 'node:fs/promises';
import { expect, Page, test } from '@playwright/test';
import { measureOverflow, mockApi } from './support';

const secretaria = 'secretaria.consultar';
const admin = 'usuarios.consultar';
const membros = 'membros.consultar';
const permissoesEdicao = ['usuarios.editar', 'cargos.consultar'];
const usuario = {
  id: '00000001-aaaa-bbbb-cccc-dddddddddddd',
  nome: 'Érica Prado',
  email: 'erica.prado.albuquerque@clube-desbravadores.example.org',
  dataCriacao: '2026-03-10T10:00:00Z',
  funcao: 'Secretária',
  cargoId: 'c1',
  ativo: true,
  fotoUrl: '/api/Usuarios/00000001-aaaa-bbbb-cccc-dddddddddddd/foto',
};
const inativo = { ...usuario, id: 'u2', nome: 'Paulo Lima', ativo: false };
const desconhecido = { ...usuario, id: 'u3', nome: 'Ana Sousa', ativo: null };

async function preparar(page: Page, permissoes: string[]) {
  await mockApi(page);
  await page.route(/\/api\/Secretaria\/Documentos(?:\?|$)/, route =>
    route.request().method() === 'GET' ? route.fulfill({ json: { items: [], total: 0 } }) : route.fallback(),
  );
  await page.route('**/api/Me/Permissoes', route => route.fulfill({
    json: { permissoes, permissoesPorDesignacao: [], versaoAutorizacao: 1 },
  }));
  await page.route('**/api/Me/Eventos', route => route.fulfill({
    json: {
      items: [{ id: 'e1', titulo: 'Reunião do clube', local: 'Sede', dataEvento: new Date().toISOString().slice(0, 10) }],
    },
  }));
  const consultas: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (request.method() === 'GET' && /^\/api\/(Usuarios|Membros)(\/|$)/i.test(url.pathname)) {
      consultas.push(url.pathname + url.search);
    }
  });
  return consultas;
}

test('Secretaria fica oculta e a URL direta redireciona sem consultar pessoas', async ({ page }) => {
  const consultas = await preparar(page, [admin, membros]);
  await page.route('**/api/Me/Permissoes', route => route.fulfill({
    json: {
      cargo: { id: 'c2', role: 'MEM', nome: 'Membro' },
      permissoes: [admin, membros],
      permissoesPorDesignacao: [],
      versaoAutorizacao: 1,
    },
  }));
  await page.goto('/secretaria');
  await expect(page).toHaveURL(/\/perfil$/);
  await expect(page.getByRole('link', { name: 'Secretaria' })).toHaveCount(0);
  expect(consultas).toEqual([]);
});

for (const [role, nome] of [
  ['ADM', 'Administrador'],
  ['DIR', 'Diretor'],
  ['DIRA', 'Diretor Associado'],
  ['SEC', 'Secretário'],
]) {
  test(`${nome} acessa Secretaria pelo menu e pela URL com o cargo retornado pela API`, async ({ page }) => {
    const consultas = await preparar(page, []);
    await page.route('**/api/Me/Permissoes', route => route.fulfill({
      json: {
        cargo: { id: 'c1', role, nome },
        permissoes: [],
        permissoesPorDesignacao: [],
        versaoAutorizacao: 1,
      },
    }));
    await page.goto('/perfil');
    const link = page.getByRole('navigation', { name: 'Navegação principal' })
      .getByRole('link', { name: 'Secretaria' });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/secretaria$/);
    await expect(link).toHaveAttribute('aria-current', 'page');
    await page.goto('/secretaria');
    await expect(page.getByRole('heading', { name: 'Secretaria', exact: true })).toBeVisible();
    await expect(page.getByText('Você não tem permissão para consultar os usuários cadastrados.')).toBeVisible();
    expect(consultas).toEqual([]);
  });
}

test('Secretaria abre pelo menu sem permissão de consultar pessoas', async ({ page }) => {
  const consultas = await preparar(page, [secretaria]);
  await page.goto('/perfil');
  const link = page.getByRole('link', { name: 'Secretaria' });
  await link.click();
  await expect(page).toHaveURL(/\/secretaria$/);
  await expect(link).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('Você não tem permissão para consultar os usuários cadastrados.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Reunião do clube/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Documentos' })).toBeVisible();
  expect(consultas).toEqual([]);
});

test('consulta resumida mantém e-mail e status indisponíveis sem consultas individuais', async ({ page }) => {
  const consultas = await preparar(page, [secretaria, membros, ...permissoesEdicao]);
  await page.route('**/api/Membros', route => route.fulfill({
    json: [{ id: 'm1', nome: 'Érica Prado', cargo: 'Secretária', role: 'SEC', email: usuario.email, ativo: false }],
  }));
  await page.goto('/secretaria');
  const linha = page.getByRole('row', { name: /Érica Prado/ });
  await expect(linha.getByRole('cell')).toHaveText(['—', 'Secretária', 'Indisponível', '—']);
  expect(consultas).toEqual(['/api/Membros']);
});

test('troca para o resumo se a permissão administrativa for revogada com a página aberta', async ({ page }) => {
  await page.clock.install();
  const consultas = await preparar(page, [secretaria, admin, membros]);
  await page.route('**/api/Usuarios', route => route.fulfill({ json: [usuario] }));
  await page.goto('/secretaria');
  await expect(page.getByText(usuario.email)).toBeVisible();
  await page.route('**/api/Me/Permissoes', route => route.fulfill({
    json: { permissoes: [secretaria, membros], permissoesPorDesignacao: [], versaoAutorizacao: 2 },
  }));
  await page.clock.fastForward(61_000);
  await expect(page.getByRole('row', { name: /Membro 1/ })).toBeVisible();
  await expect(page.getByText(usuario.email)).toHaveCount(0);
  expect(consultas).toEqual(['/api/Usuarios', '/api/Membros']);
});

test('consulta administrativa tem prioridade, pesquisa e inclui inativos sob demanda', async ({ page }) => {
  const consultas = await preparar(page, [secretaria, admin, membros, ...permissoesEdicao]);
  await page.route(/\/api\/Usuarios(?:\?|$)/, route => route.fulfill({
    json: new URL(route.request().url()).searchParams.has('includeInactive')
      ? [usuario, desconhecido, inativo] : [usuario, desconhecido],
  }));
  await page.goto('/secretaria');
  const tabela = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'E-mail' }) });
  await expect(tabela.getByRole('columnheader')).toHaveText(['Nome', 'E-mail', 'Perfil', 'Status', 'Ações']);
  await expect(tabela.getByRole('row').nth(1)).toContainText('Ativo');
  await expect(tabela.getByRole('row').nth(1)).toContainText(usuario.email);
  await expect(tabela.getByRole('row').nth(2)).toContainText('Indisponível');

  const pesquisa = page.getByRole('searchbox', { name: 'Pesquisar usuários por nome ou perfil' });
  await pesquisa.fill('erica');
  await expect(tabela.getByRole('row')).toHaveCount(2);
  await expect(page.getByText('1 usuário', { exact: true })).toBeVisible();
  await pesquisa.fill('secretaria');
  await expect(tabela.getByRole('row')).toHaveCount(3);
  await pesquisa.fill('sem correspondência');
  await expect(tabela.getByText('Nenhum usuário corresponde à pesquisa.')).toBeVisible();
  await pesquisa.clear();
  await expect(tabela.getByRole('row')).toHaveCount(3);
  await page.getByLabel('Exibir inativos').check();
  const linhaInativa = tabela.getByRole('row', { name: /Paulo Lima/ });
  await expect(linhaInativa).toContainText('Inativo');
  await expect(linhaInativa.getByRole('button')).toHaveCount(0);
  expect(consultas).toEqual(['/api/Usuarios', '/api/Usuarios?includeInactive=true']);
});

test('erro e nova tentativa ficam no painel de usuários e o resultado vazio é distinto', async ({ page }) => {
  const consultas = await preparar(page, [secretaria, admin]);
  let totalEventos = 0;
  page.on('request', request => { if (request.url().endsWith('/api/Me/Eventos')) totalEventos++; });
  let tentativas = 0;
  const primeiraResposta = Promise.withResolvers<void>();
  await page.route('**/api/Usuarios', async route => {
    if (++tentativas === 1) {
      await primeiraResposta.promise;
      return route.fulfill({ status: 500, json: {} });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/secretaria');
  await expect(page.getByText('Carregando usuários…')).toBeVisible();
  primeiraResposta.resolve();
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar os usuários.');
  await expect(page.getByText('Nenhum usuário cadastrado.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Reunião do clube/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Abrir calendário de eventos' })).toBeEnabled();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Nenhum usuário cadastrado.')).toBeVisible();
  expect(consultas).toEqual(['/api/Usuarios', '/api/Usuarios']);
  expect(totalEventos).toBe(1);
});

for (const mode of ['light', 'dark'] as const) {
  test(`tabela e navegação compacta em ${mode}, incluindo ações por teclado na última linha`, async ({ page }, testInfo) => {
    const compacto = mode === 'dark';
    await page.setViewportSize(compacto ? { width: 320, height: 568 } : { width: 1366, height: 900 });
    await page.addInitScript(theme => localStorage.setItem('app-theme', theme), mode);
    await preparar(page, [
      secretaria, admin, membros, 'dashboard.consultar', 'financeiro.tesouraria.consultar',
      'autorizacao.consultar', 'usuarios.excluir', ...permissoesEdicao,
    ]);
    await page.route('**/api/Usuarios', route => route.fulfill({ json: [desconhecido, usuario] }));
    await page.goto('/secretaria');
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await expect(page.locator('aside.sidebar')).toHaveCount(1);
    await expect(page.locator('header.topbar')).toHaveCount(1);

    const nav = page.getByRole('navigation', { name: 'Navegação principal' });
    for (const destino of ['Dashboard', 'Desbravadores', 'Tesouraria', 'Eventos', 'Secretaria', 'Cargos e permissões']) {
      const link = nav.getByRole('link', { name: destino, exact: true });
      await expect(link).toBeInViewport();
    }
    await expect(nav.getByRole('link', { name: 'Secretaria' })).toHaveAttribute('aria-current', 'page');
    const tabela = page.getByRole('region', { name: 'Usuários cadastrados' }).filter({ has: page.getByRole('table') }).last();
    await expect(tabela.getByRole('table')).toBeVisible();
    expect((await measureOverflow(page)).documentOverflow).toBe(0);
    await page.screenshot({ path: testInfo.outputPath('secretaria.png'), fullPage: true });

    const acoes = page.getByRole('button', { name: 'Ações para Érica Prado' });
    await acoes.focus();
    await page.keyboard.press('Enter');
    const editar = page.getByRole('menuitem', { name: 'Editar' });
    await expect(editar).toBeFocused();
    await expect(editar).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(editar).toHaveCount(0);
    await expect(acoes).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Excluir' })).toBeFocused();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Érica Prado');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    await acoes.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/desbravadores\/editar$/);
    await expect(page.locator('app-user-edit .user-summary').getByLabel('Nome', { exact: true })).toHaveValue('Érica Prado');
  });
}

test('grade mostra cinco usuários, mantém o cabeçalho fixo e pesquisa em toda a lista', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await preparar(page, [secretaria, admin]);
  const usuarios = Array.from({ length: 8 }, (_, i) => ({
    ...usuario,
    id: `u-${i}`,
    nome: `Usuário ${i + 1}`,
    email: i === 2 ? 'endereco.extenso.para.testar.a.quebra.de.linha.na.grade@example.org' : usuario.email,
  }));
  await page.route('**/api/Usuarios', route => route.fulfill({ json: usuarios }));
  await page.goto('/secretaria');

  const tabela = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'E-mail' }) });
  const area = tabela.locator('..');
  await expect(tabela.getByRole('row')).toHaveCount(9);
  const cabeçalho = tabela.getByRole('columnheader', { name: 'Nome' });
  const quinto = tabela.getByRole('rowheader', { name: 'Usuário 5', exact: true });
  const sexto = tabela.getByRole('rowheader', { name: 'Usuário 6', exact: true });
  await expect(quinto).toBeInViewport({ ratio: 0.98 });
  await expect(sexto).not.toBeInViewport({ ratio: 0.05 });

  await area.focus();
  await page.keyboard.press('End');
  await expect(tabela.getByRole('rowheader', { name: 'Usuário 8', exact: true })).toBeInViewport();
  await expect(cabeçalho).toBeInViewport({ ratio: 0.98 });

  const pesquisa = page.getByRole('searchbox', { name: 'Pesquisar usuários por nome ou perfil' });
  await pesquisa.fill('Usuario 8');
  await expect(tabela.getByRole('row')).toHaveCount(2);
  await pesquisa.clear();
  await expect(quinto).toBeInViewport({ ratio: 0.98 });
  await expect(sexto).not.toBeInViewport({ ratio: 0.05 });
});

test('grade vazia de documentos tem uma pesquisa independente por título', async ({ page }) => {
  await preparar(page, [secretaria]);
  await page.goto('/secretaria');
  const documentos = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Título' }) });
  const pesquisa = page.getByRole('searchbox', { name: 'Pesquisar documentos por título' });
  const criar = page.getByRole('button', { name: '+ Criar documento', exact: true });
  await expect(criar).toBeVisible();
  await expect(criar).toBeEnabled();
  const campo = (await pesquisa.boundingBox())!;
  const botao = (await criar.boundingBox())!;
  expect(botao.x).toBeGreaterThanOrEqual(campo.x + campo.width);
  expect(botao.y).toBeLessThan(campo.y + campo.height);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/\/secretaria$/);
  await expect(documentos.getByText('Nenhum documento cadastrado.')).toBeVisible();
  await pesquisa.fill('Ata');
  await expect(documentos.getByText('Nenhum documento corresponde à pesquisa.')).toBeVisible();
  await pesquisa.clear();
  await expect(documentos.getByText('Nenhum documento cadastrado.')).toBeVisible();
});

test('botão do calendário fica acima dos cards, alinhado à direita, e abre Eventos', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await preparar(page, [secretaria]);
  await page.goto('/secretaria');

  const secao = page.getByRole('region', { name: 'Eventos e reuniões' });
  const calendario = secao.getByRole('button', { name: 'Abrir calendário de eventos' });
  const card = secao.getByRole('button', { name: /Reunião do clube/ });
  await expect(calendario).toBeVisible();
  await expect(card).toBeVisible();

  const limite = (await secao.boundingBox())!;
  const botao = (await calendario.boundingBox())!;
  expect(Math.abs(botao.x + botao.width - (limite.x + limite.width))).toBeLessThanOrEqual(1);
  expect(botao.y + botao.height).toBeLessThanOrEqual((await card.boundingBox())!.y);

  await calendario.click();
  await expect(page).toHaveURL(/\/eventos$/);
});

test('Eventos e reuniões pagina três cards por vez e trunca título e local longos', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.setViewportSize({ width: 390, height: 844 });
  await preparar(page, [secretaria]);
  const dataEvento = new Date().toISOString().slice(0, 10);
  const titulo = 'Reunião com um título extenso para testar o limite horizontal do card no celular';
  const local = 'Local com um endereço longo para testar que o texto permanece em uma única linha';
  await page.route('**/api/Me/Eventos', route => route.fulfill({
    json: {
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `e${i + 1}`, titulo: `${titulo} ${i + 1}`, local, dataEvento,
      })),
    },
  }));
  await page.goto('/secretaria');

  const secao = page.getByRole('region', { name: 'Eventos e reuniões' });
  const cards = secao.getByRole('button', { name: /Reunião com um título extenso/ });
  await expect(cards).toHaveCount(3);
  const paginacao = secao.getByRole('navigation', { name: 'Paginação de próximos eventos' });
  const anterior = paginacao.getByRole('button', { name: 'Eventos anteriores' });
  const proximo = paginacao.getByRole('button', { name: 'Mais eventos' });
  await expect(paginacao).toContainText('1 de 2');
  await expect(anterior).toBeDisabled();
  await expect(secao.getByRole('button', { name: 'Abrir calendário de eventos' })).toBeVisible();

  for (const texto of [cards.first().getByText(`${titulo} 1`, { exact: true }), cards.first().getByText(local, { exact: true })]) {
    await expect(texto).toHaveCSS('white-space', 'nowrap');
    await expect(texto).toHaveCSS('text-overflow', 'ellipsis');
    expect(await texto.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  }

  await proximo.click();
  await expect(secao.locator('.upcoming-list')).toHaveCount(1);
  await expect(paginacao).toContainText('2 de 2');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().getByText(`${titulo} 4`, { exact: true })).toBeVisible();
  await expect(proximo).toBeDisabled();

  await anterior.click();
  await expect(paginacao).toContainText('1 de 2');
  await expect(cards).toHaveCount(3);
});

test('Eventos e reuniões avança automaticamente a cada cinco segundos e volta ao início', async ({ page }) => {
  await preparar(page, [secretaria]);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  const dataEvento = new Date().toISOString().slice(0, 10);
  await page.route('**/api/Me/Eventos', route => route.fulfill({
    json: {
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `e${i + 1}`, titulo: `Evento ${i + 1}`, local: 'Sede', dataEvento,
      })),
    },
  }));
  await page.goto('/secretaria');
  const secao = page.getByRole('region', { name: 'Eventos e reuniões' });
  const navegacao = secao.getByRole('navigation', { name: 'Paginação de próximos eventos' });
  await expect(navegacao).toContainText('1 de 2');
  await page.evaluate(() => {
    document.addEventListener('animationstart', event => {
      const alvo = event.target as HTMLElement;
      if (event.animationName.endsWith('card-entrada')) {
        alvo.dataset['direcaoEntrada'] = getComputedStyle(alvo).getPropertyValue('--direcao').trim();
      }
    });
  });

  await expect(navegacao.getByRole('button')).toHaveCount(2);
  await page.clock.runFor(4000);
  await expect(secao.locator('.entrando')).toHaveCount(0);
  await page.clock.runFor(1000);
  await expect(navegacao).toContainText('2 de 2');
  const quarto = secao.getByRole('button', { name: /Evento 4/ });
  await expect(quarto).toHaveAttribute('data-direcao-entrada', '1');

  await page.clock.runFor(5000);
  await expect(navegacao).toContainText('1 de 2');
  await expect(secao.getByRole('button', { name: /Evento 1/ })).toHaveAttribute('data-direcao-entrada', '1');

  await secao.getByRole('button', { name: 'Abrir calendário de eventos' }).focus();
  await page.clock.runFor(5000);
  await expect(navegacao).toContainText('1 de 2');
  await page.getByRole('heading', { name: 'Secretaria', exact: true }).click();
  await page.clock.runFor(5000);
  await expect(navegacao).toContainText('2 de 2');
});

for (const largura of [1366, 390]) {
  test(`transição direcional dos cards com largura de ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await preparar(page, [secretaria]);
    const dataEvento = new Date().toISOString().slice(0, 10);
    await page.route('**/api/Me/Eventos', route => route.fulfill({
      json: {
        items: Array.from({ length: 8 }, (_, i) => ({
          id: `e${i + 1}`, titulo: `Evento ${i + 1}`, local: 'Sede', dataEvento,
        })),
      },
    }));
    await page.goto('/secretaria');
    const secao = page.getByRole('region', { name: 'Eventos e reuniões' });
    const paginacao = secao.getByRole('navigation', { name: 'Paginação de próximos eventos' });
    const calendario = secao.getByRole('button', { name: 'Abrir calendário de eventos' });
    await calendario.focus();
    const cabecalho = secao.getByRole('heading', { name: 'Eventos e reuniões' });
    const posicoes = async () => Promise.all([paginacao.boundingBox(), calendario.boundingBox(), cabecalho.boundingBox()]);
    const iniciais = await posicoes();

    for (const [direcao, paginaInicial, destino] of [[1, 1, 2], [1, 2, 3], [-1, 3, 2], [-1, 2, 1]]) {
      const seta = paginacao.getByRole('button', { name: direcao === 1 ? 'Mais eventos' : 'Eventos anteriores' });
      // Congela as animações no navegador para inspecionar o início e a sobreposição sem depender da taxa de quadros.
      await seta.evaluate(botao => {
        const secao = botao.closest('aside')!;
        const observar = new MutationObserver(() => {
          const entrando = secao.querySelector('.entrando');
          if (!entrando) return;
          for (const animacao of secao.getAnimations({ subtree: true })) animacao.pause();
          observar.disconnect();
        });
        observar.observe(secao, { childList: true, subtree: true, attributes: true });
        botao.click();
      });
      const saindo = secao.locator('.saindo');
      const entrando = secao.locator('.entrando');
      await expect(saindo).toHaveAttribute('inert', '');
      await expect(saindo).toHaveAttribute('aria-hidden', 'true');
      await expect(entrando).not.toHaveAttribute('inert');
      await expect(paginacao).toContainText(`${paginaInicial} de 3`);
      expect(await posicoes()).toEqual(iniciais);

      await seta.evaluate(botao => { botao.click(); botao.click(); });
      await expect(secao.locator('.upcoming-list')).toHaveCount(2);
      const amostra = await secao.locator('.cards-viewport').evaluate(area => {
        const ler = (lista: string, tempo: number) => Array.from(area.querySelectorAll<HTMLElement>(`${lista} button`)).map(card => {
          const animacao = card.getAnimations().find(item => item instanceof CSSAnimation)!;
          animacao.currentTime = tempo;
          const estilo = getComputedStyle(card);
          return {
            coluna: card.offsetLeft,
            atraso: animacao.effect!.getTiming().delay,
            duracao: animacao.effect!.getTiming().duration,
            x: estilo.transform === 'none' ? 0 : new DOMMatrix(estilo.transform).m41,
            blur: estilo.filter,
            opacidade: Number(estilo.opacity),
          };
        });
        const saida = ler('.saindo', 30);
        const entrada = ler('.entrando', 40);
        const tempoSobreposicao = saida[0].atraso + 190;
        return {
          saida, entrada,
          par: [ler('.saindo', tempoSobreposicao)[0], ler('.entrando', tempoSobreposicao)[0]],
        };
      });
      const quantidadeSaida = paginaInicial === 3 ? 2 : 3;
      const quantidadeEntrada = destino === 3 ? 2 : 3;
      const atrasos = Array.from({ length: quantidadeSaida }, (_, i) => 42 * (direcao === 1 ? quantidadeSaida - 1 - i : i));
      expect(amostra.saida.map(card => card.atraso)).toEqual(atrasos);
      expect(amostra.saida.every(card => card.duracao === 245)).toBe(true);
      const primeiro = amostra.saida[direcao === 1 ? quantidadeSaida - 1 : 0];
      if (largura === 1366) {
        const colunas = amostra.saida.map(card => card.coluna);
        expect(new Set(colunas).size).toBe(quantidadeSaida);
        expect(primeiro.coluna).toBe(direcao === 1 ? Math.max(...colunas) : Math.min(...colunas));
      }
      expect(primeiro.x * direcao).toBeGreaterThan(0);
      expect(primeiro.blur).not.toBe('blur(0px)');
      expect(primeiro.opacidade).toBeLessThan(1);
      expect(amostra.saida.filter(card => card.x !== 0)).toHaveLength(1);
      expect(amostra.entrada).toHaveLength(quantidadeEntrada);
      expect(amostra.entrada.every(card => card.duracao === 295 && card.opacidade === 0 && card.x === -direcao * 56)).toBe(true);
      expect(amostra.entrada.slice(0, quantidadeSaida).map(card => card.atraso))
        .toEqual(atrasos.slice(0, quantidadeEntrada).map(atraso => atraso + 160));
      const [saindoEmMovimento, entrandoEmMovimento] = amostra.par;
      expect(saindoEmMovimento.x * direcao).toBeGreaterThan(0);
      expect(entrandoEmMovimento.x * direcao).toBeLessThan(0);
      expect(amostra.par.every(card => card.opacidade > 0 && card.opacidade < 1)).toBe(true);
      expect((await measureOverflow(page)).documentOverflow).toBe(0);

      await secao.locator('.cards-viewport').evaluate(area => {
        for (const animacao of area.getAnimations({ subtree: true })) animacao.finish();
      });
      await expect(paginacao).toContainText(`${destino} de 3`);
      await expect(secao.locator('.upcoming-list')).toHaveCount(1);
      expect(await posicoes()).toEqual(iniciais);
    }
  });
}

const consultarDocumentos = 'secretaria.documentos.consultar';
const criarDocumentos = 'secretaria.documentos.criar';
const editarDocumentos = 'secretaria.documentos.editar';
const importacao = '**/api/Secretaria/Documentos/Importacao';
const acervo = /\/api\/Secretaria\/Documentos(?:\?|$)/;
const botaoCriar = (page: Page) => page.getByRole('button', { name: '+ Criar documento', exact: true });
const modalCriar = (page: Page) => page.getByRole('dialog', { name: 'Criar documento' });
const amostra = (extensao: string) => ({
  name: 'Original.' + extensao, mimeType: 'application/octet-stream', buffer: Buffer.from('fixture'),
});

for (const tema of ['light', 'dark']) {
  test(`fechamento pelo fundo restaura o foco e limpa os campos em ${tema}`, async ({ page }) => {
    await page.addInitScript(valor => localStorage.setItem('app-theme', valor), tema);
    await preparar(page, [secretaria, criarDocumentos]);
    await page.goto('/secretaria');

    const abrir = botaoCriar(page);
    const modal = modalCriar(page);
    await abrir.click();
    await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
    const tipo = modal.getByRole('combobox', { name: 'Tipo de documento' });
    const nome = modal.getByLabel('Nome do documento');
    await tipo.selectOption('Ata');
    await nome.fill('Documento a descartar');

    const painel = modal.locator('.painel');
    const area = (await painel.boundingBox())!;
    await page.mouse.click(area.x + 8, area.y + 24);
    await expect(modal).toBeVisible();
    await expect(nome).toHaveValue('Documento a descartar');

    await page.mouse.click(4, 4);
    await expect(modal).toHaveCount(0);
    await expect(abrir).toBeFocused();
    await abrir.press('Enter');
    await expect(modal.getByRole('textbox', { name: 'Tipo de documento' })).toHaveValue('');
    await expect(nome).toHaveCount(0);
    await expect(modal.getByRole('checkbox', { name: 'Enviar documento pronto' })).not.toBeChecked();
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(abrir).toBeFocused();
  });

  test(`grade vazia abre um único modal e respeita a recusa da API em ${tema}`, async ({ page }) => {
    await page.addInitScript(valor => localStorage.setItem('app-theme', valor), tema);
    await preparar(page, [secretaria, consultarDocumentos]);
    const operacoes: string[] = [];
    await page.route(acervo, route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: { items: [], total: 0 } });
      operacoes.push(route.request().method());
      return route.fulfill({ status: 403 });
    });
    await page.route(importacao, route => {
      operacoes.push('importação');
      return route.fulfill({ status: 403 });
    });
    await page.goto('/secretaria');
    await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
    await expect(page.getByText('Nenhum documento cadastrado.')).toBeVisible();

    const abrir = botaoCriar(page);
    const modal = modalCriar(page);
    await expect(abrir).toBeEnabled();
    await abrir.click();
    await expect(modal).toBeVisible();
    await modal.getByRole('button', { name: 'Cancelar' }).click();
    await expect(modal).toHaveCount(0);
    await expect(abrir).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(modal).toBeVisible();
    await expect(page.locator('app-modal')).toHaveCount(1);
    expect(operacoes).toEqual([]);

    await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
    await modal.getByLabel('Tipo de documento').selectOption('Ata');
    await modal.locator('input[type=file]').setInputFiles(amostra('pdf'));
    await expect(modal.getByLabel('Nome do documento')).toHaveValue('Original.pdf');
    await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
    await expect(modal.getByRole('alert')).toHaveText('Você não tem permissão para importar documentos.');
    expect(operacoes).toEqual(['importação']);
  });

  for (const largura of [320, 1366]) {
    test(`modal de documentos em ${tema}, ${largura}px, com foco e controles acessíveis`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: largura, height: largura === 320 ? 480 : 900 });
      await page.addInitScript(valor => localStorage.setItem('app-theme', valor), tema);
      await preparar(page, [secretaria, criarDocumentos]);
      await page.goto('/secretaria');

      const abrir = botaoCriar(page);
      if (largura === 320) await abrir.press('Enter');
      else await abrir.click();
      const modal = modalCriar(page);
      await expect(modal).toBeVisible();
      await expect(modal.getByLabel('Tipo de documento')).toBeFocused();
      expect(await modal.evaluate(el => el.matches(':modal'))).toBe(true);
      await expect(modal.locator('.painel')).toHaveCSS('background-color', tema === 'dark' ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)');
      await testInfo.attach('modal', { body: await modal.locator('.painel').screenshot(), contentType: 'image/png' });
      const enviar = modal.getByRole('button', { name: 'Criar documento', exact: true });
      await enviar.scrollIntoViewIfNeeded();
      await expect(enviar).toBeInViewport();
      await expect(modal.getByRole('button', { name: 'Cancelar' })).toBeInViewport();

      for (let i = 0; i < 9; i++) {
        await page.keyboard.press('Tab');
        expect(await modal.evaluate(el => el.contains(document.activeElement))).toBe(true);
      }
      await modal.getByRole('checkbox', { name: 'Usar como template' }).press('Space');
      await expect(modal.getByRole('checkbox', { name: 'Usar como template' })).toBeChecked();
      await expect(modal.getByLabel('Nome do documento')).toHaveCount(0);
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await expect(abrir).toBeFocused();
    });
  }
}

for (const formato of ['docx', 'xlsx', 'pdf']) {
  test(`importa e reabre ${formato} editável usando o ID retornado`, async ({ page }) => {
    await preparar(page, [secretaria, consultarDocumentos, criarDocumentos, editarDocumentos]);
    const tipo = 'Autorização de saída';
    const titulo = 'Novo título escrito';
    const markdown = '# Editável';
    const registro = { id: 'doc-real', versao: 'rev-1', tipo, titulo, markdown };
    const chamadas: string[] = [];
    let gravado = false;
    await page.route(acervo, route => {
      if (route.request().method() === 'GET') {
        chamadas.push('listar');
        return route.fulfill({ json: { items: gravado ? [registro] : [], total: Number(gravado) } });
      }
      chamadas.push('salvar');
      expect(route.request().postDataJSON()).toEqual({ tipo, titulo, markdown });
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      gravado = true;
      return route.fulfill({ status: 201, json: { id: registro.id, versao: registro.versao } });
    });
    await page.route(importacao, route => {
      chamadas.push('importar');
      expect(route.request().headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
      expect(route.request().postData()).toContain('name="modo"\r\n\r\ndocumento');
      expect(route.request().postData()).toContain(`filename="Original.${formato}"`);
      return route.fulfill({ json: { modo: 'documento', markdown, avisos: formato === 'pdf' ? ['Revise o OCR da página 1.'] : [] } });
    });
    let edicoes = 0;
    await page.route('**/api/Secretaria/Documentos/doc-real', route => {
      if (route.request().method() === 'GET') return route.fulfill({ json: registro });
      expect(route.request().method()).toBe('PUT');
      expect(route.request().postDataJSON()).toEqual({ titulo, tipo, markdown: '# Revisado', versao: 'rev-1' });
      edicoes++;
      return route.fulfill({ json: { versao: 'rev-2' } });
    });

    await page.goto('/secretaria');
    await botaoCriar(page).click();
    const modal = modalCriar(page);
    await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
    await modal.getByLabel('Tipo de documento').selectOption(tipo);
    await modal.locator('input[type=file]').setInputFiles(amostra(formato));
    const nome = modal.getByLabel('Nome do documento');
    await expect(nome).toHaveValue('Original.' + formato);
    await expect(modal.getByText('Original.' + formato, { exact: true })).toHaveCount(0);
    const upload = (await modal.locator('.upload').boundingBox())!;
    const nomeCampo = (await nome.boundingBox())!;
    expect(nomeCampo.y).toBeGreaterThan(upload.y + upload.height);
    const remover = (await modal.getByRole('button', { name: 'Remover arquivo' }).boundingBox())!;
    const cancelar = (await modal.getByRole('button', { name: 'Cancelar' }).boundingBox())!;
    expect(remover.x + remover.width).toBeLessThan(cancelar.x);
    await nome.fill(titulo);
    await modal.getByLabel('Tipo de documento').focus();
    await expect(nome).toHaveValue(titulo);
    await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
    await expect(modal).toHaveCount(0);
    if (formato === 'pdf') await expect(page.getByText('Revise o OCR da página 1.')).toBeVisible();
    const editar = page.getByRole('link', { name: 'Editar ' + titulo });
    await expect(editar).toBeVisible();
    expect(chamadas).toEqual(['listar', 'importar', 'salvar', 'listar']);
    await editar.click();
    await expect(page).toHaveURL(/\/doc-real\/editar$/);
    const editor = page.getByLabel('Editor Markdown');
    await expect(editor).toHaveValue(markdown);
    if (formato === 'pdf') {
      await editor.fill('# Revisado');
      await page.getByRole('button', { name: 'Salvar documento' }).click();
      await expect(page.getByText('Alterações salvas')).toBeVisible();
      await expect(page).toHaveURL(/\/doc-real\/editar$/);
      expect(edicoes).toBe(1);
      expect(chamadas.filter(chamada => chamada === 'salvar')).toHaveLength(1);
    }
  });

  test(`abre ${formato} como template e grava somente no primeiro Salvar`, async ({ page }) => {
    await preparar(page, [secretaria, criarDocumentos]);
    const estrutura = '# Ata\n\nData: {{data}}';
    const tipo = 'Modelo de reunião regional';
    let gravacoes = 0;
    await page.route(importacao, route => {
      expect(route.request().postData()).toContain('name="modo"\r\n\r\ntemplate');
      return route.fulfill({ json: { modo: 'template', markdown: estrutura, avisos: [] } });
    });
    await page.route(acervo, route => {
      if (route.request().method() === 'GET') return route.fallback();
      gravacoes++;
      expect(route.request().postDataJSON()).toEqual({ titulo: 'Ata nova', tipo, markdown: estrutura });
      return route.fulfill({ status: 201, json: { id: 'novo', versao: 'rev-1' } });
    });
    await page.goto('/secretaria');
    const abrirTemplate = async () => {
      await botaoCriar(page).click();
      const modal = modalCriar(page);
      await modal.getByRole('checkbox', { name: 'Usar como template' }).check();
      await modal.getByRole('textbox', { name: 'Tipo de documento' }).fill(`  ${tipo}  `);
      await modal.locator('input[type=file]').setInputFiles(amostra(formato));
      await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
      await expect(page).toHaveURL(/\/documentos\/novo$/);
      await expect(page.getByLabel('Nome do documento')).toHaveValue('Novo documento');
      await expect(page.getByLabel('Editor Markdown')).toHaveValue(estrutura);
      await expect(page.getByLabel('Tipo de documento')).toHaveValue(tipo);
    };
    await abrirTemplate();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Voltar à Secretaria' }).click();
    await expect(botaoCriar(page)).toBeVisible();
    expect(gravacoes).toBe(0);
    await abrirTemplate();
    await page.getByLabel('Nome do documento').fill('Ata nova');
    await page.getByRole('button', { name: 'Salvar documento' }).click();
    await expect(page).toHaveURL(/\/novo\/editar$/);
    expect(gravacoes).toBe(1);
  });
}

test('valida tipo, arquivo ausente, ilegível, formato, tamanho e extensão no drop', async ({ page }) => {
  await preparar(page, [secretaria, criarDocumentos]);
  await page.goto('/secretaria');
  await botaoCriar(page).click();
  const modal = modalCriar(page);
  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  const tipo = modal.getByLabel('Tipo de documento');
  const seletor = modal.locator('input[type=file]');
  await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
  await expect(tipo).toHaveAttribute('aria-invalid', 'true');
  await expect(modal.getByText('Selecione um arquivo.', { exact: true })).toBeVisible();
  await seletor.setInputFiles({ ...amostra('pdf'), buffer: Buffer.alloc(0) });
  await expect(modal.getByText('Não foi possível ler o arquivo.')).toBeVisible();
  await seletor.setInputFiles({ ...amostra('pdf'), buffer: Buffer.alloc(1_000_001) });
  await expect(modal.getByText('O arquivo excede o limite de 1 MB.')).toBeVisible();
  await modal.locator('.upload').evaluate(el => {
    const dados = new DataTransfer();
    dados.items.add(new File(['inválido'], 'ata.txt'));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dados, bubbles: true }));
  });
  await expect(modal.getByText('Selecione um arquivo DOCX, XLSX ou PDF.')).toBeVisible();
  await modal.locator('.upload').evaluate(el => {
    const dados = new DataTransfer();
    dados.items.add(new File(['a'], 'ata.pdf'));
    dados.items.add(new File(['b'], 'ata.docx'));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dados, bubbles: true }));
  });
  await expect(modal.getByText('Selecione somente um arquivo.')).toBeVisible();
});

test('preserva a chave, o conteúdo e o título após perda da resposta e bloqueia envio duplicado', async ({ page }) => {
  await preparar(page, [secretaria, consultarDocumentos, criarDocumentos]);
  const primeiraGravacao = Promise.withResolvers<void>();
  const liberarErro = Promise.withResolvers<void>();
  const registros = new Map<string, { id: string; versao: string; titulo: string }>();
  let conversoes = 0;
  let gravacoes = 0;
  await page.route(importacao, route => {
    conversoes++;
    return route.fulfill({ json: { modo: 'documento', markdown: '# Ata', avisos: [] } });
  });
  await page.route(acervo, async route => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: { items: [...registros.values()], total: registros.size } });
    }
    const chave = route.request().headers()['idempotency-key'];
    const { titulo } = route.request().postDataJSON();
    if (!registros.has(chave)) registros.set(chave, { id: `doc-${registros.size}`, versao: '1', titulo });
    gravacoes++;
    if (gravacoes === 1) {
      primeiraGravacao.resolve();
      await liberarErro.promise;
      return route.abort('failed');
    }
    return route.fulfill({ json: registros.get(chave) });
  });
  await page.goto('/secretaria');
  await botaoCriar(page).click();
  const modal = modalCriar(page);
  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  await modal.getByLabel('Tipo de documento').selectOption('Ata');
  await modal.locator('input[type=file]').setInputFiles(amostra('docx'));
  await expect(modal.getByLabel('Nome do documento')).toHaveValue('Original.docx');
  await modal.getByLabel('Nome do documento').fill('Ata revisada');
  const enviar = modal.getByRole('button', { name: 'Criar documento', exact: true });
  await enviar.click();
  await primeiraGravacao.promise;
  await expect(enviar).toBeDisabled();
  await page.locator('.criar-documento-form').evaluate(el => el.dispatchEvent(new Event('submit', { cancelable: true })));
  liberarErro.resolve();
  await expect(modal.getByRole('alert')).toHaveText('Não foi possível salvar o documento. Tente novamente.');
  await expect(modal.getByLabel('Nome do documento')).toHaveValue('Ata revisada');
  await enviar.click();
  await expect(page.getByRole('rowheader', { name: 'Ata revisada' })).toHaveCount(1);
  expect([conversoes, gravacoes, registros.size]).toEqual([1, 2, 1]);
});

test('trocar para template durante importação descarta a resposta antiga', async ({ page }) => {
  await preparar(page, [secretaria, criarDocumentos]);
  const iniciou = Promise.withResolvers<void>();
  const responder = Promise.withResolvers<void>();
  let gravacoes = 0;
  await page.route(acervo, route => {
    if (route.request().method() === 'GET') return route.fallback();
    gravacoes++;
    return route.fulfill({ status: 500 });
  });
  await page.route(importacao, async route => {
    if (route.request().postData()?.includes('name="modo"\r\n\r\ndocumento')) {
      iniciou.resolve();
      await responder.promise;
      return route.fulfill({ json: { modo: 'documento', markdown: 'Dados preenchidos', avisos: ['Aviso antigo'] } });
    }
    return route.fulfill({ json: { modo: 'template', markdown: '# Estrutura', avisos: [] } });
  });
  await page.goto('/secretaria');
  await botaoCriar(page).click();
  const modal = modalCriar(page);
  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  await modal.getByLabel('Tipo de documento').selectOption('Ata');
  await modal.locator('input[type=file]').setInputFiles(amostra('pdf'));
  const enviar = modal.getByRole('button', { name: 'Criar documento', exact: true });
  await enviar.click();
  await iniciou.promise;
  await modal.getByRole('checkbox', { name: 'Usar como template' }).check();
  responder.resolve();
  await expect(modal.getByLabel('Nome do documento')).toHaveCount(0);
  await modal.getByRole('textbox', { name: 'Tipo de documento' }).fill('Ata');
  await enviar.click();
  await expect(page.getByLabel('Editor Markdown')).toHaveValue('# Estrutura');
  await expect(page.getByText('Aviso antigo')).toHaveCount(0);
  expect(gravacoes).toBe(0);
});

test('erro de leitura da API fica associado ao arquivo e mantém os dados para tentar novamente', async ({ page }) => {
  await preparar(page, [secretaria, criarDocumentos]);
  await page.route(importacao, route => route.fulfill({ status: 422, json: { title: 'Arquivo ilegível' } }));
  await page.goto('/secretaria');
  await botaoCriar(page).click();
  const modal = modalCriar(page);
  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  await modal.getByLabel('Tipo de documento').selectOption('Ata');
  const arquivo = modal.locator('input[type=file]');
  await arquivo.setInputFiles(amostra('pdf'));
  await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
  await expect(arquivo).toHaveAttribute('aria-invalid', 'true');
  await expect(modal.getByRole('alert')).toContainText('Não foi possível ler o arquivo.');
  await expect(modal.getByLabel('Tipo de documento')).toHaveValue('Ata');
  await expect(modal.getByLabel('Nome do documento')).toHaveValue('Original.pdf');
  await expect(modal.getByRole('button', { name: 'Criar documento', exact: true })).toBeEnabled();
});

for (const acao of ['Cancelar', 'Remover arquivo'] as const) {
  test(`${acao} durante conversão impede que a resposta inicie a gravação`, async ({ page }) => {
    await preparar(page, [secretaria, criarDocumentos]);
    const iniciou = Promise.withResolvers<void>();
    const responder = Promise.withResolvers<void>();
    const respondeu = Promise.withResolvers<void>();
    let gravacoes = 0;
    await page.route(acervo, route => {
      if (route.request().method() === 'GET') return route.fallback();
      gravacoes++;
      return route.fulfill({ status: 500 });
    });
    await page.route(importacao, async route => {
      iniciou.resolve();
      await responder.promise;
      try {
        await route.fulfill({ json: { modo: 'documento', markdown: '# Ata', avisos: [] } });
      } finally {
        respondeu.resolve();
      }
    });
    await page.goto('/secretaria');
    await botaoCriar(page).click();
    const modal = modalCriar(page);
    await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
    await modal.getByLabel('Tipo de documento').selectOption('Ata');
    await modal.locator('input[type=file]').setInputFiles(amostra('pdf'));
    await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
    await iniciou.promise;
    await modal.getByRole('button', { name: acao, exact: true }).click();
    responder.resolve();
    await respondeu.promise;
    if (acao === 'Cancelar') {
      await expect(modal).toHaveCount(0);
      await expect(botaoCriar(page)).toBeFocused();
    } else {
      await expect(modal).toBeVisible();
      await expect(modal.getByLabel('Nome do documento')).toHaveValue('');
    }
    await expect(page.getByText('Documento criado.', { exact: true })).toHaveCount(0);
    expect(gravacoes).toBe(0);
  });
}

test('trocar o modo limpa o tipo e grava somente a opção escolhida no select', async ({ page }) => {
  await preparar(page, [secretaria, criarDocumentos]);
  const tiposGravados: string[] = [];
  let importacoes = 0;
  await page.route(importacao, route => {
    importacoes++;
    expect(route.request().postData()).toContain('name="modo"\r\n\r\ndocumento');
    return route.fulfill({ json: { modo: 'documento', markdown: '# Documento', avisos: [] } });
  });
  await page.route(acervo, route => {
    if (route.request().method() === 'GET') return route.fallback();
    tiposGravados.push(route.request().postDataJSON().tipo);
    return route.fulfill({ status: 201, json: { id: 'doc', versao: '1' } });
  });
  await page.goto('/secretaria');
  await botaoCriar(page).click();

  const modal = modalCriar(page);
  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  const seletor = modal.getByRole('combobox', { name: 'Tipo de documento' });
  const campoLivre = modal.getByRole('textbox', { name: 'Tipo de documento' });
  const erroTipo = modal.getByText('Informe o tipo de documento.');
  const enviar = modal.getByRole('button', { name: 'Criar documento', exact: true });
  await expect(seletor).toHaveValue('');
  await expect(seletor.getByRole('option')).toHaveText([
    'Selecione o tipo de documento',
    'Ata',
    'Autorização de saída',
    'Ficha de cadastro',
  ]);
  await seletor.selectOption('Ata');
  await modal.locator('input[type=file]').setInputFiles(amostra('docx'));

  await modal.getByRole('checkbox', { name: 'Usar como template' }).check();
  await expect(seletor).toHaveCount(0);
  await expect(campoLivre).toHaveAttribute('placeholder', 'Ex.: Ata');
  await expect(campoLivre).toHaveValue('');
  await expect(erroTipo).toHaveCount(0);
  await campoLivre.fill('   ');
  await enviar.click();
  await expect(campoLivre).toHaveAttribute('aria-invalid', 'true');
  await expect(erroTipo).toBeVisible();
  await campoLivre.fill('Modelo personalizado');

  await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
  await expect(campoLivre).toHaveCount(0);
  await expect(seletor).toHaveValue('');
  await expect(seletor.locator('option:checked')).toHaveText('Selecione o tipo de documento');
  await expect(erroTipo).toHaveCount(0);
  await enviar.click();
  await expect(erroTipo).toBeVisible();
  expect(importacoes).toBe(0);

  await seletor.selectOption('Ficha de cadastro');
  await enviar.click();
  await expect(modal).toHaveCount(0);
  expect(importacoes).toBe(1);
  expect(tiposGravados).toEqual(['Ficha de cadastro']);
});

for (const modo of ['documento', 'template'] as const) {
  test(`fechar e reabrir descarta a importação pendente no modo ${modo}`, async ({ page }) => {
    await preparar(page, [secretaria, criarDocumentos]);
    const iniciou = Promise.withResolvers<void>();
    const liberarResposta = Promise.withResolvers<void>();
    const respondeu = Promise.withResolvers<void>();
    let gravacoes = 0;
    await page.route(importacao, async route => {
      iniciou.resolve();
      await liberarResposta.promise;
      try {
        await route.fulfill({ json: { modo, markdown: '# Antigo', avisos: ['Aviso antigo'] } });
      } finally {
        respondeu.resolve();
      }
    });
    await page.route(acervo, route => {
      if (route.request().method() === 'GET') return route.fallback();
      gravacoes++;
      return route.fulfill({ status: 201, json: { id: 'doc-antigo', versao: '1' } });
    });
    await page.goto('/secretaria');
    const abrir = botaoCriar(page);
    const modal = modalCriar(page);
    await abrir.click();
    if (modo === 'template') {
      await modal.getByRole('checkbox', { name: 'Usar como template' }).check();
      await modal.getByRole('textbox', { name: 'Tipo de documento' }).fill('Tipo anterior');
    } else {
      await modal.getByRole('checkbox', { name: 'Enviar documento pronto' }).check();
      await modal.getByRole('combobox', { name: 'Tipo de documento' }).selectOption('Ata');
    }
    await modal.locator('input[type=file]').setInputFiles(amostra('docx'));
    await modal.getByRole('button', { name: 'Criar documento', exact: true }).click();
    await iniciou.promise;

    await page.mouse.click(4, 4);
    await expect(modal).toHaveCount(0);
    await abrir.press('Enter');
    await expect(modal).toBeVisible();
    liberarResposta.resolve();
    await respondeu.promise;

    await expect(page).toHaveURL(/\/secretaria$/);
    await expect(modal.getByRole('textbox', { name: 'Tipo de documento' })).toHaveValue('');
    await expect(modal.getByText('Original.docx')).toHaveCount(0);
    await expect(page.getByText('Aviso antigo')).toHaveCount(0);
    expect(gravacoes).toBe(0);
  });
}

test('editor vazio cria uma vez, leva o rascunho posterior à edição e atualiza a grade', async ({ page }) => {
  await preparar(page, [secretaria]);
  const inicio = Promise.withResolvers<void>();
  const gravar = Promise.withResolvers<void>();
  const id = 'ata-234';
  let registro = { id, titulo: '', tipo: '', markdown: '', versao: 'v1', formatosExportacao: ['pdf', 'md', 'docx'] };
  let posts = 0;
  let puts = 0;
  await page.route(acervo, async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ json: { items: posts ? [registro] : [], total: posts } });
    }
    posts++;
    expect(req.headers()['idempotency-key']).toBeTruthy();
    expect(req.postDataJSON()).toEqual({ titulo: 'Ata da reunião', tipo: 'Ata', markdown: '# Enviado' });
    registro = { ...registro, ...req.postDataJSON() };
    inicio.resolve();
    await gravar.promise;
    await route.fulfill({ status: 201, json: { id, versao: 'v1' } });
  });
  await page.route('**/api/Secretaria/Documentos/' + id, route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: registro });
    expect(route.request().method()).toBe('PUT');
    expect(route.request().postDataJSON()).toEqual({
      titulo: 'Ata revisada', tipo: 'Ata', markdown: '# Depois do envio', versao: puts === 0 ? 'v1' : 'v2',
    });
    puts++;
    registro = { ...registro, ...route.request().postDataJSON(), versao: 'v' + (puts + 1), formatosExportacao: ['pdf', 'md', 'xlsx'] };
    return route.fulfill({ json: { versao: registro.versao } });
  });
  await page.goto('/secretaria');
  await botaoCriar(page).click();
  await modalCriar(page).getByRole('button', { name: 'Criar documento' }).click();
  await expect(page).toHaveURL(/\/documentos\/novo$/);
  await expect(page.getByText('Alterações salvas', { exact: true })).toHaveCount(0);
  const exportar = page.getByRole('button', { name: /^Exportar / });
  await exportar.click();
  await expect(page.getByText('Salve o documento antes de exportar.')).toBeVisible();
  await page.keyboard.press('Escape');

  const titulo = page.getByLabel('Nome do documento');
  const tipo = page.getByLabel('Tipo de documento');
  const markdown = page.getByLabel('Editor Markdown');
  const salvar = page.getByRole('button', { name: 'Salvar documento' });
  await titulo.fill('  Ata da reunião  ');
  await tipo.fill(' Ata ');
  await markdown.fill('# Enviado');
  await salvar.click();
  await inicio.promise;
  await expect(salvar).toBeDisabled();
  await expect(page.getByText('Salvando…', { exact: true })).toBeVisible();
  await titulo.fill('  Ata revisada  ');
  await markdown.fill('# Depois do envio');
  gravar.resolve();

  await expect(page).toHaveURL(/\/ata-234\/editar$/);
  await expect(markdown).toHaveValue('# Depois do envio');
  await expect(page.getByText('Alterações não salvas', { exact: true })).toBeVisible();
  await exportar.click();
  const dialogo = page.getByRole('dialog', { name: 'Exportar documento' });
  await expect(dialogo.getByText(/última versão salva/)).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'DOCX' })).toBeVisible();
  await page.keyboard.press('Escape');

  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('link', { name: 'Voltar à Secretaria' }).click();
  await expect(markdown).toHaveValue('# Depois do envio');
  await salvar.click();
  await expect(page.getByText('Alterações salvas', { exact: true })).toBeVisible();
  await expect(titulo).toHaveValue('Ata revisada');
  await expect(tipo).toHaveValue('Ata');
  await exportar.click();
  await expect(dialogo.getByRole('button', { name: 'XLSX' })).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'DOCX' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await salvar.click();
  await expect(page.getByText('Documento salvo.').last()).toBeVisible();
  await expect.poll(() => puts).toBe(2);
  await expect(salvar).toBeEnabled();
  await page.goBack();
  await expect(page).toHaveURL(/\/secretaria$/);
  await expect(page.getByRole('rowheader', { name: 'Ata revisada' })).toHaveCount(1);
  expect(posts).toBe(1);
});

test('editor mantém o rascunho após falha de rede e conflito e bloqueia gravar após GET 404', async ({ page }) => {
  await preparar(page, [secretaria]);
  const chaves: string[] = [];
  await page.route(acervo, route => {
    if (route.request().method() === 'GET') return route.fallback();
    chaves.push(route.request().headers()['idempotency-key']);
    return chaves.length === 1 ? route.abort('failed') : route.fulfill({ status: 409 });
  });
  await page.route('**/api/Secretaria/Documentos/inexistente', route => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ status: 404 });
  });
  await page.goto('/secretaria/documentos/inexistente/editar');
  await expect(page.getByText('Documento não encontrado.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salvar documento' })).toBeDisabled();
  expect(chaves).toHaveLength(0);

  await page.goto('/secretaria/documentos/novo');
  await page.getByLabel('Nome do documento').fill('Ata');
  await page.getByLabel('Tipo de documento').fill('Ata');
  const markdown = page.getByLabel('Editor Markdown');
  await markdown.fill('# Rascunho');
  const salvar = page.getByRole('button', { name: 'Salvar documento' });
  await salvar.click();
  await expect(page.locator('app-documento-editor > .erro')).toContainText('Seu rascunho continua');
  await expect(markdown).toHaveValue('# Rascunho');
  await salvar.click();
  await expect(page.locator('app-documento-editor > .erro')).toContainText('outra sessão');
  await expect(markdown).toHaveValue('# Rascunho');
  await expect(page.getByText('Alterações não salvas', { exact: true })).toBeVisible();
  expect(chaves[0]).toBeTruthy();
  expect(chaves).toEqual([chaves[0], chaves[0]]);
  expect(await page.evaluate(() => {
    const evento = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  })).toBe(true);
});

const tabelaLarga = [
  Array.from({ length: 60 }, (_, i) => 'Coluna ' + (i + 1)),
  Array.from({ length: 60 }, () => '---'),
  Array.from({ length: 60 }, () => 'Valor'),
].map(linha => '| ' + linha.join(' | ') + ' |');
const markdownAta = [
  '# Reunião', '', 'Olá **diretoria** e *equipe*.', '', '- Primeiro', '- Segundo',
  '', '> Citação', '', '\x60\x60\x60', 'conteúdo de código'.repeat(30), '\x60\x60\x60', '',
  '[Site](https://example.org)', '', '| A | B |', '|---|---|', '| ação | conclusão |',
  '', ...tabelaLarga, '', '<iframe title="Elemento fora da lista permitida"></iframe>',
  '', ...Array.from({ length: 50 }, (_, i) => 'Linha ' + (i + 1)),
].join('\n');
const ata234 = { id: 'ata', titulo: 'Ata da reunião', tipo: 'Ata', markdown: markdownAta, versao: 'v1', formatosExportacao: ['pdf', 'md', 'docx'] };
const planilha234 = { id: 'planilha', titulo: 'Lista de presença', tipo: 'Planilha', markdown: '| A | B |\n|---|---|\n| 1 | 2 |', versao: 'v1', formatosExportacao: ['pdf', 'md', 'xlsx'] };

for (const [tema, largura] of [['light', 1366], ['dark', 390]] as const) {
  test(`prévia e leitura compartilham o Markdown em ${tema}, ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await page.addInitScript(valor => localStorage.setItem('app-theme', valor), tema);
    await preparar(page, [secretaria]);
    await page.route(acervo, route => route.fulfill({ json: { items: [ata234], total: 1 } }));
    await page.route('**/api/Secretaria/Documentos/ata', route => route.fulfill({ json: ata234 }));
    await page.goto('/secretaria/documentos/ata/visualizar');
    await expect(page.getByRole('heading', { name: ata234.titulo, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar documento' })).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Formatação Markdown' })).toHaveCount(0);
    const previa = page.locator('.editor-previa');
    const link = previa.getByRole('link', { name: 'Site' });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    for (const seletor of ['h1', 'strong', 'em', 'ul', 'blockquote', 'pre', 'table']) {
      await expect(previa.locator(seletor).first()).toBeVisible();
    }
    await expect(previa.getByRole('cell', { name: 'ação' })).toBeVisible();
    await expect(previa.locator('iframe')).toHaveCount(0);
    expect(await previa.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await previa.locator('pre').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    const html = await previa.innerHTML();
    await page.reload();
    await expect(link).toBeVisible();
    await page.getByRole('link', { name: 'Voltar à Secretaria' }).click();
    await page.getByRole('link', { name: 'Visualizar ' + ata234.titulo }).click();
    await expect(page).toHaveURL(/\/ata\/visualizar$/);
    await page.getByRole('link', { name: 'Voltar à Secretaria' }).click();
    await page.getByRole('link', { name: 'Editar ' + ata234.titulo }).click();
    await expect(page).toHaveURL(/\/ata\/editar$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
    await expect(previa.getByRole('link', { name: 'Site' })).toHaveAttribute('target', '_blank');
    expect(await previa.innerHTML()).toBe(html);
    const escrita = page.locator('.editor-painel').first();
    const painel = page.locator('#painel-previa-documento');
    const esquerda = (await escrita.boundingBox())!;
    const direita = (await painel.boundingBox())!;
    if (largura > 768) {
      expect(Math.abs(esquerda.width - direita.width)).toBeLessThan(3);
      expect(esquerda.y).toBe(direita.y);
    } else {
      expect(direita.y).toBeGreaterThan(esquerda.y);
    }
    const visualizar = page.getByRole('button', { name: 'Visualizar', exact: true });
    const campo = page.getByLabel('Editor Markdown');
    await campo.evaluate((el: HTMLTextAreaElement) => {
      el.setSelectionRange(3, 8);
      el.scrollTop = 90;
    });
    const posicao = await campo.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.scrollTop]);
    expect(posicao[2]).toBeGreaterThan(0);
    await expect.poll(() => page.locator('.editor-numeracao').evaluate(el => el.scrollTop)).toBe(posicao[2]);
    await expect(visualizar).toHaveAttribute('aria-pressed', 'true');
    await visualizar.press('Space');
    await expect(visualizar).toHaveAttribute('aria-pressed', 'false');
    await expect(painel).toBeHidden();
    if (largura > 768) expect((await escrita.boundingBox())!.width).toBeGreaterThan(esquerda.width);
    await visualizar.press('Space');
    await expect(painel).toBeVisible();
    await expect(campo).toHaveValue(markdownAta);
    await expect(page.getByText('Linhas: ' + markdownAta.split('\n').length)).toBeVisible();
    expect(await campo.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.scrollTop])).toEqual(posicao);
    expect((await measureOverflow(page)).documentOverflow).toBeLessThanOrEqual(1);
  });
}

test('grade exporta com os formatos da API e rejeita resposta sem arquivo válido', async ({ page }) => {
  await preparar(page, [secretaria]);
  await page.route(acervo, route => route.fulfill({ json: { items: [ata234, planilha234], total: 2 } }));
  const requisicoes: string[] = [];
  await page.route(/\/api\/Secretaria\/Documentos\/(ata|planilha)\/exportar\?/, route => {
    const url = new URL(route.request().url());
    requisicoes.push(url.pathname + url.search);
    expect(route.request().headers()['authorization']).toBe('Bearer token-de-teste');
    return url.pathname.endsWith('/ata/exportar')
      ? route.fulfill({ contentType: 'text/markdown; charset=utf-8', body: markdownAta, headers: {
        'Content-Disposition': "attachment; filename=Reuniao.md; filename*=UTF-8''Reuni%C3%A3o.md",
      } })
      : route.fulfill({ contentType: 'text/html', body: '<html>Resposta inválida</html>' });
  });
  await page.goto('/secretaria');
  const exportarAta = page.getByRole('button', { name: 'Exportar ' + ata234.titulo });
  const dialogo = page.getByRole('dialog', { name: 'Exportar documento' });
  await exportarAta.press('Enter');
  await expect(dialogo.getByRole('button', { name: 'DOCX' })).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'XLSX' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(exportarAta).toBeFocused();
  expect(requisicoes).toEqual([]);
  await exportarAta.click();
  const download = page.waitForEvent('download');
  await dialogo.getByRole('button', { name: 'MD', exact: true }).press('Enter');
  const arquivo = await download;
  expect(arquivo.suggestedFilename()).toBe('Reunião.md');
  expect(await readFile(await arquivo.path(), 'utf8')).toBe(markdownAta);
  await expect(dialogo).toHaveCount(0);
  await expect(exportarAta).toBeFocused();

  await page.getByRole('button', { name: 'Exportar ' + planilha234.titulo }).click();
  await expect(dialogo.getByRole('button', { name: 'DOCX' })).toHaveCount(0);
  const downloadsInvalidos: string[] = [];
  page.on('download', arquivo => downloadsInvalidos.push(arquivo.suggestedFilename()));
  await dialogo.getByRole('button', { name: 'XLSX' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('Não foi possível baixar o documento');
  expect(downloadsInvalidos).toEqual([]);
  expect(requisicoes).toEqual([
    '/api/Secretaria/Documentos/ata/exportar?formato=md',
    '/api/Secretaria/Documentos/planilha/exportar?formato=xlsx',
  ]);
});

test('leitura mostra 404 e o guard bloqueia acesso direto sem permissão da Secretaria', async ({ page }) => {
  await preparar(page, [secretaria]);
  let consultas = 0;
  await page.route('**/api/Secretaria/Documentos/removido', route => {
    consultas++;
    return route.fulfill({ status: 404 });
  });
  await page.goto('/secretaria/documentos/removido/visualizar');
  await expect(page.getByRole('alert')).toHaveText('Documento não encontrado.');
  await expect(page.getByRole('link', { name: 'Voltar à Secretaria' })).toBeVisible();
  await page.route('**/api/Me/Permissoes', route => route.fulfill({
    json: { permissoes: ['secretaria.documentos.consultar'], permissoesPorDesignacao: [], versaoAutorizacao: 2 },
  }));
  await page.reload();
  await expect(page).toHaveURL(/\/perfil$/);
  expect(consultas).toBe(1);
});

test('conflito no PUT preserva a versão e o rascunho da edição', async ({ page }) => {
  await preparar(page, [secretaria]);
  const versoes: string[] = [];
  await page.route('**/api/Secretaria/Documentos/ata', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: ata234 });
    expect(route.request().method()).toBe('PUT');
    const corpo = route.request().postDataJSON();
    versoes.push(corpo.versao);
    expect(corpo.markdown).toBe('# Rascunho em edição');
    return route.fulfill({ status: 409 });
  });
  await page.goto('/secretaria/documentos/ata/editar');
  const markdown = page.getByLabel('Editor Markdown');
  await expect(markdown).toHaveValue(markdownAta);
  await markdown.fill('# Rascunho em edição');
  const salvar = page.getByRole('button', { name: 'Salvar documento' });
  for (let i = 0; i < 2; i++) {
    await salvar.click();
    await expect(page.locator('app-documento-editor > .erro')).toContainText('outra sessão');
    await expect(markdown).toHaveValue('# Rascunho em edição');
  }
  expect(versoes).toEqual(['v1', 'v1']);
});
