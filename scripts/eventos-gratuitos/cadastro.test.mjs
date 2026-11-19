import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { prepararEventos, validarMembros, chaveIdempotencia, validarEvento, cadastrar, novoResumo, PERIODO } from './cadastro.mjs';

const membro = '11111111-1111-4111-8111-111111111111';
const eventos = prepararEventos([membro]);
function dto(conteudo, indice = 1) {
  return { ...structuredClone(conteudo), id: `22222222-2222-4222-8222-${String(indice).padStart(12, '0')}`,
    eventoGrupoId: '33333333-3333-4333-8333-333333333333', ativo: true, versao: 'AAAAAAAB',
    quantidadeMembros: 1, valorPorMembro: 0, total: 0, lancamentos: [], devolucoes: [] };
}
function servidor({ items = [], permissoes = ['eventos.consultar', 'eventos.criar', 'membros.consultar'], minimo = '2026-11-01', post } = {}) {
  const chamadas = [];
  const api = async (method, path, body, headers) => {
    chamadas.push({ method, path, body, headers });
    let data;
    let status = 200;
    if (path === '/Me/Permissoes') data = { permissoes };
    else if (path === '/Membros') data = [{ id: membro, nome: 'Teste' }];
    else if (method === 'GET' && path.startsWith('/Eventos?')) data = { ...PERIODO, dataMinimaCadastro: minimo, items: structuredClone(items) };
    else if (method === 'GET') data = structuredClone(items.find(e => path === `/Eventos/${e.id}`));
    else {
      assert.equal(path, '/Eventos');
      data = dto(body, items.length + 1);
      items.push(data);
      status = 201;
      if (post) data = post(data);
    }
    return { body: data, status };
  };
  return { api, chamadas, items };
}

test('12 datas civis distintas, 5 em novembro, 7 em dezembro, componentes zerados', () => {
  assert.equal(eventos.length, 12);
  assert.equal(eventos.filter(e => e.dataEvento.startsWith('2026-11')).length, 5);
  assert.equal(new Set(eventos.map(e => e.dataEvento)).size, 12);
  for (const evento of eventos) {
    assert.equal(evento.transporte.valor + evento.alimentacao.valor + evento.seguroObrigatorio, 0);
    assert.equal(evento.transporte.ehGratis, true);
    assert.equal(evento.alimentacao.individual, false);
    assert(evento.titulo.length <= 150 && evento.descricao.length <= 2000 && evento.local.length <= 200);
  }
});
test('recusa membros vazios, GUID inválido/zero/repetido e membro real', () => {
  for (const ids of [[], ['x'], ['00000000-0000-0000-0000-000000000000'], [membro, membro]]) assert.throws(() => prepararEventos(ids));
  assert.throws(() => validarMembros([membro], []));
  assert.throws(() => validarMembros([membro], [{ id: membro, nome: 'Maria' }]));
  assert.throws(() => validarMembros([membro], [{ id: membro, nome: 'Teste', ativo: false }]));
});
test('UUID estável entre execuções e mudanças no corpo, distinto por evento', () => {
  const chaves = eventos.map(chaveIdempotencia);
  assert.equal(new Set(chaves).size, 12);
  for (const chave of chaves) assert.match(chave, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(chaves[0], chaveIdempotencia({ ...eventos[0], membros: [], descricao: 'alterada' }));
});
test('cria via POST, verifica por GET, preserva anterior e repete sem POST', async () => {
  const anterior = dto({ ...eventos[0], titulo: 'Evento anterior', descricao: null }, 99);
  const s = servidor({ items: [anterior] });
  const resumo = novoResumo(eventos);
  await cadastrar(s.api, eventos, resumo);
  assert(resumo.every(r => r.situacao === 'criado' && r.verificado));
  assert.deepEqual(s.items[0], anterior);
  const repeticao = novoResumo(eventos);
  await cadastrar(s.api, eventos, repeticao);
  assert(repeticao.every(r => r.situacao === 'existente' && r.verificado));
  assert.equal(s.chamadas.filter(c => c.method === 'POST').length, 12);
  assert.equal(s.items.length, 13);
  for (const c of s.chamadas.filter(c => c.method === 'POST')) assert.equal(c.headers['Idempotency-Key'], chaveIdempotencia(c.body));
});
for (const chave of ['eventos.consultar', 'eventos.criar', 'membros.consultar']) {
  test(`sem ${chave}, não envia POST`, async () => {
    const s = servidor({ permissoes: ['eventos.consultar', 'eventos.criar', 'membros.consultar'].filter(p => p !== chave) });
    await assert.rejects(cadastrar(s.api, eventos, novoResumo(eventos)), /Permissão/);
    assert(!s.chamadas.some(c => c.method === 'POST'));
  });
}
test('data mínima futura bloqueia o lote antes do primeiro POST', async () => {
  const s = servidor({ minimo: '2026-12-01' });
  await assert.rejects(cadastrar(s.api, eventos, novoResumo(eventos)), /data anterior/);
  assert.equal(s.items.length, 0);
});
for (const alteracao of [{ total: 1 }, { lancamentos: [{ valor: 0 }] }, { dataEvento: '2026-11-21' }, { titulo: undefined }, { membros: [] }]) {
  test(`rejeita resposta divergente: ${Object.keys(alteracao)[0]}`, () => {
    assert.throws(() => validarEvento({ ...dto(eventos[0]), ...alteracao }, eventos[0]));
  });
}
test('colisão com evento anterior bloqueia o lote sem editar nem duplicar', async () => {
  const s = servidor({ items: [{ ...dto(eventos[11]), descricao: 'Evento legítimo anterior' }] });
  await assert.rejects(cadastrar(s.api, eventos, novoResumo(eventos)), /descricao/);
  assert(!s.chamadas.some(c => c.method !== 'GET'));
});
test('duplicações já existentes bloqueiam antes de qualquer mutação', async () => {
  const s = servidor({ items: [dto(eventos[0]), dto(eventos[0], 2)] });
  await assert.rejects(cadastrar(s.api, eventos, novoResumo(eventos)), /Duplicações/);
  assert(!s.chamadas.some(c => c.method === 'POST'));
});
test('falha após persistência interrompe; reexecução reconcilia sem duplicar', async () => {
  let primeira = true;
  const s = servidor({ post: e => { if (primeira) { primeira = false; throw new Error('timeout'); } return e; } });
  await assert.rejects(cadastrar(s.api, eventos, novoResumo(eventos)), /timeout/);
  assert.equal(s.items.length, 1);
  const resumo = novoResumo(eventos);
  await cadastrar(s.api, eventos, resumo);
  assert.equal(resumo[0].situacao, 'existente');
  assert.equal(s.items.length, 12);
  assert.equal(s.chamadas.filter(c => c.method === 'POST').length, 12);
});
test('cobrança inesperada interrompe o lote, preservando contagem dos POST 201', async () => {
  const s = servidor({ post: e => ({ ...e, lancamentos: [{ valor: 10 }] }) });
  const resumo = novoResumo(eventos);
  await assert.rejects(cadastrar(s.api, eventos, resumo), /cobrança/);
  assert.equal(s.chamadas.filter(c => c.method === 'POST').length, 1);
  assert.equal(resumo[0].situacao, 'criado');
  assert(resumo[0].falha);
});
test('lista inválida não é interpretada como vazia', async () => {
  const s = servidor();
  const api = (method, path, ...args) => path.startsWith('/Eventos?') ? { body: {} } : s.api(method, path, ...args);
  await assert.rejects(cadastrar(api, eventos, novoResumo(eventos)), /Listagem/);
  assert.equal(s.items.length, 0);
});
test('entrada de produção é recusada antes de qualquer acesso externo', () => {
  const r = spawnSync(process.execPath, ['scripts/cadastrar-eventos-gratuitos.mjs'], { encoding: 'utf8', env: { ...process.env, NODE_ENV: 'production' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /Exige NODE_ENV=development/);
});
