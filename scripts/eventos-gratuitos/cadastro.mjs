import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const PERIODO = { dataInicial: '2026-11-01', dataFinal: '2026-12-31' };
const MARCA = '[TESTE CALENDARIO 2026 v1]';
const AGENDA = [
  ['Reunião de Diretoria', '2026-11-20', 'Igreja Central', 'Organização fictícia das equipes e revisão do planejamento do clube.'],
  ['Culto Jovem', '2026-11-22', 'Igreja Central', 'Encontro de teste com músicas, reflexão e participação das unidades.'],
  ['Reunião de Planejamento', '2026-11-25', 'Sala de Reuniões', 'Planejamento fictício das atividades educativas do próximo mês.'],
  ['Treinamento de Primeiros Socorros', '2026-11-28', 'Igreja Central', 'Simulação educativa de cuidados básicos com orientação da liderança.'],
  ['Caminhada Ecológica', '2026-11-30', 'Parque Ibirapuera', 'Caminhada fictícia de observação da natureza e cuidado ambiental.'],
  ['Reunião de Unidades', '2026-12-03', 'Clube Almirante Tamandaré', 'Encontro de teste para organizar tarefas e fortalecer o trabalho em equipe.'],
  ['Oficina de Nós e Amarras', '2026-12-05', 'Igreja Central', 'Oficina fictícia de nós básicos e amarras para atividades do clube.'],
  ['Ação Social Comunitária', '2026-12-07', 'Comunidade Local', 'Atividade fictícia de solidariedade e organização de doações.'],
  ['Treinamento de Ordem Unida', '2026-12-10', 'Quadra da Igreja', 'Treino de teste de comandos e formação das unidades.'],
  ['Gincana de Especialidades', '2026-12-13', 'Clube Almirante Tamandaré', 'Gincana fictícia com desafios educativos de especialidades.'],
  ['Reunião Geral do Clube', '2026-12-17', 'Igreja Central', 'Encontro de teste para avaliar atividades e compartilhar aprendizados.'],
  ['Encerramento das Atividades', '2026-12-20', 'Igreja Central', 'Celebração fictícia de encerramento com integração das unidades.'],
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidValido = id => typeof id === 'string' && UUID.test(id) && !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id);
const normalizar = texto => texto.normalize('NFC').trim().toLocaleLowerCase('pt-BR');

export function prepararEventos(membros) {
  assert(Array.isArray(membros) && membros.length > 0, 'Informe ao menos um membro de teste existente.');
  assert(membros.every(uuidValido) && new Set(membros).size === membros.length, 'IDs inválidos ou repetidos.');
  // O backend normaliza a ordem dos membros para idempotência.
  return AGENDA.map(([titulo, dataEvento, local, descricao]) => ({
    titulo, dataEvento, local, descricao: `${MARCA} ${descricao} Atividade gratuita, sem cobranças.`,
    transporte: { valor: 0, ehGratis: true },
    alimentacao: { individual: false, valor: 0 },
    seguroObrigatorio: 0, membros: [...membros].sort(), eventoReferenciaId: null,
  }));
}

export function validarMembros(membros, existentes) {
  assert(Array.isArray(existentes), 'GET /Membros não retornou um array.');
  for (const id of membros) {
    const membro = existentes.find(m => m.id?.toLowerCase() === id);
    assert(membro && membro.ativo !== false, `Membro ${id} inexistente ou inativo.`);
    // A API não tem flag "de teste": exigimos ID explícito e nome claramente identificado.
    assert(/\b(teste|test|homologação|homologacao|homolog)\b/i.test(membro.nome ?? ''),
      `Membro ${id} não está identificado como teste/homologação. Nenhum membro será criado ou renomeado.`);
  }
}

export function chaveIdempotencia(evento) {
  // Independente dos participantes: mudar o corpo não pode abrir outra operação silenciosamente.
  const hash = createHash('sha256').update(`${MARCA}|${evento.dataEvento}|${evento.titulo}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function validarEvento(evento, esperado) {
  assert(evento && uuidValido(evento.id) && uuidValido(evento.eventoGrupoId), 'Resposta sem IDs válidos.');
  assert(evento.ativo === true && typeof evento.versao === 'string' && evento.versao.length > 0,
    'Evento inativo ou sem versão.');
  for (const campo of ['titulo', 'descricao', 'dataEvento', 'local', 'seguroObrigatorio', 'eventoReferenciaId']) {
    assert.deepEqual(evento[campo], esperado[campo], `Campo ${campo} diverge do cadastro de teste.`);
  }
  assert.deepEqual(evento.transporte, esperado.transporte, 'Transporte não é gratuito.');
  assert.deepEqual(evento.alimentacao, esperado.alimentacao, 'Alimentação diverge do cadastro gratuito.');
  assert(Array.isArray(evento.membros), 'Resposta sem participantes.');
  assert.deepEqual([...evento.membros].sort(), esperado.membros, 'Participantes divergentes.');
  assert.equal(evento.quantidadeMembros, esperado.membros.length, 'Quantidade de participantes divergente.');
  assert.equal(evento.valorPorMembro, 0, 'Valor por membro deve ser zero.');
  assert.equal(evento.total, 0, 'Total deve ser zero.');
  assert.deepEqual(evento.lancamentos, [], 'Evento gratuito gerou cobrança; interrompido sem novas mutações.');
  assert.deepEqual(evento.devolucoes ?? [], [], 'Evento de teste possui devoluções inesperadas.');
}

function candidatos(items, esperado) {
  return items.filter(e => e.dataEvento === esperado.dataEvento &&
    (normalizar(e.titulo ?? '') === normalizar(esperado.titulo) ||
      (e.descricao?.startsWith(MARCA) && normalizar(e.local ?? '') === normalizar(esperado.local))));
}

export async function consultar(api) {
  const { body } = await api('GET', `/Eventos?${new URLSearchParams(PERIODO)}`);
  assert(body && Array.isArray(body.items), 'Listagem de eventos inválida; cadastro bloqueado.');
  assert.equal(body.dataInicial, PERIODO.dataInicial);
  assert.equal(body.dataFinal, PERIODO.dataFinal);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(body.dataMinimaCadastro), 'dataMinimaCadastro inválida.');
  assert(body.items.every(e => uuidValido(e.id) && typeof e.dataEvento === 'string'), 'Item inválido na listagem.');
  assert.equal(new Set(body.items.map(e => e.id)).size, body.items.length, 'IDs repetidos na listagem.');
  return body;
}

/** Somente GET e POST /Eventos. Nunca corrige, exclui ou altera um evento existente. */
export async function cadastrar(api, eventos, resumo) {
  const permissoes = (await api('GET', '/Me/Permissoes')).body?.permissoes;
  for (const chave of ['eventos.consultar', 'eventos.criar', 'membros.consultar']) {
    assert(Array.isArray(permissoes) && permissoes.includes(chave), `Permissão necessária: ${chave}.`);
  }
  validarMembros(eventos[0].membros, (await api('GET', '/Membros')).body);
  const antes = await consultar(api);
  // Valida todos os conflitos e datas antes do primeiro POST.
  for (const esperado of eventos) {
    const matches = candidatos(antes.items, esperado);
    assert(matches.length <= 1, `Duplicações preexistentes: ${esperado.titulo}.`);
    if (matches.length) validarEvento(matches[0], esperado);
    else assert(esperado.dataEvento >= antes.dataMinimaCadastro, `${esperado.titulo}: data anterior ao mínimo da API (${antes.dataMinimaCadastro}).`);
  }
  for (const esperado of eventos) {
    const linha = resumo.find(r => r.titulo === esperado.titulo);
    try {
      // Reconcilia novamente antes de cada POST (inclusive após uma execução interrompida).
      const matches = candidatos((await consultar(api)).items, esperado);
      assert(matches.length <= 1, 'Mais de um evento correspondente; não será criado outro.');
      let evento = matches[0];
      if (evento) {
        validarEvento(evento, esperado);
        linha.situacao = 'existente';
      } else {
        const resposta = await api('POST', '/Eventos', esperado, { 'Idempotency-Key': chaveIdempotencia(esperado) });
        // Registra o efeito confirmado mesmo se a validação seguinte falhar.
        linha.situacao = resposta.status === 201 ? 'criado' : 'existente';
        evento = resposta.body;
        linha.id = evento?.id;
        validarEvento(evento, esperado);
      }
      linha.id = evento.id;
      const atual = (await api('GET', `/Eventos/${evento.id}`)).body;
      validarEvento(atual, esperado); // Replay pode conter uma versão antiga: sempre GET.
      linha.verificado = true;
    } catch (erro) {
      linha.falha = erro.message;
      if (linha.situacao === 'pendente') linha.situacao = 'falha';
      throw erro; // Sem retries de POST, sem compensações financeiras ou exclusões automáticas.
    }
  }
  const depois = await consultar(api);
  for (const esperado of eventos) {
    const matches = candidatos(depois.items, esperado);
    assert.equal(matches.length, 1, `Persistência/duplicidade: ${esperado.titulo}.`);
    validarEvento(matches[0], esperado);
  }
  for (const anterior of antes.items) {
    assert.deepEqual(depois.items.find(e => e.id === anterior.id), anterior,
      `Evento anterior ${anterior.id} mudou durante a execução.`);
  }
  return depois.items;
}

export function novoResumo(eventos) {
  return eventos.map(e => ({ titulo: e.titulo, data: e.dataEvento, situacao: 'pendente', verificado: false }));
}
