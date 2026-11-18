import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EventoDto } from '../../core/models/evento.model';
import { EventosService } from '../../core/services/eventos';
import { PermissoesService } from '../../core/services/permissoes';
import { Eventos } from './eventos';
import { temPagamentos, dataCivil, erroEvento, formatarData, grupoEvento, mapearEventos, periodoInclusivo, somarDias } from './eventos.utils';

const evento: EventoDto = {
  id: 'e1', eventoGrupoId: 'g1', eventoReferenciaId: null, dataEvento: '2026-11-17', local: 'Igreja',
  membros: ['m1'], quantidadeMembros: 1, transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 },
  seguroObrigatorio: 5, valorPorMembro: 5, total: 5, versao: 'AAAAAAAABAA=', ativo: true,
  lancamentos: [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Pendente' }],
};
const resposta = (items: EventoDto[] = []) => ({ items, dataInicial: '2026-11-01', dataFinal: '2026-11-30', dataMinimaCadastro: '2026-11-01' });

describe('Eventos: datas civis, mapeamento e erros', () => {
  it('converte o fim exclusivo e preserva ano bissexto e virada de ano', () => {
    expect(periodoInclusivo(new Date(2026, 9, 26), new Date(2026, 11, 7))).toEqual({ dataInicial: '2026-10-26', dataFinal: '2026-12-06' });
    expect(somarDias('2028-02-28', 1)).toBe('2028-02-29');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-11-17', 365)).toBe('2027-11-17');
  });
  it('formata datas civis sem parse ISO/UTC e mantém o dia no calendário', () => {
    expect(dataCivil(new Date(2026, 10, 17, 23, 59))).toBe('2026-11-17');
    expect(formatarData('2026-11-17')).toBe('17 de novembro de 2026');
    const visual = mapearEventos([evento])[0];
    expect(visual.start).toBe('2026-11-17'); expect(visual.allDay).toBe(true);
    expect(visual.title).toBe('Evento — Igreja'); expect(visual).not.toHaveProperty('startTime');
    expect(mapearEventos([{ ...evento, titulo: 'Reunião do clube' }])[0].title).toBe('Reunião do clube');
  });
  it('identifica grupos, preserva IDs e não agrega valores financeiros', () => {
    const outro = { ...evento, id: 'e2', total: 30 };
    const visuais = mapearEventos([evento, outro]);
    expect(visuais.map(v => v.id)).toEqual(['e1', 'e2']);
    expect(grupoEvento(outro, [evento, outro])).toBe('Grupo 2 de 2');
    expect(visuais[0].classNames).toEqual(visuais[1].classNames);
    expect(evento.total).toBe(5);
  });
  it('distingue pagamento de cobrança atrasada', () => {
    expect(temPagamentos(evento)).toBe(false);
    expect(temPagamentos({ ...evento, lancamentos: [{ ...evento.lancamentos[0], status: 'Pago' }] })).toBe(true);
    expect(temPagamentos({ ...evento, lancamentos: [{ ...evento.lancamentos[0], status: 'Atrasado' }] })).toBe(false);
  });
  it.each([[400, 'Confira'], [401, 'sessão expirou'], [403, 'permissão'], [404, 'não encontrado'], [409, 'alterado'], [500, 'consulte os dados atuais'], [0, 'conexão']])('HTTP %s tem feedback específico', (status, mensagem) => {
    expect(erroEvento(new HttpErrorResponse({ status: Number(status) }))).toContain(mensagem);
  });
  it('preserva ProblemDetails e erros de validação do servidor', () => {
    expect(erroEvento(new HttpErrorResponse({ status: 400, error: { detail: 'Dados inválidos.', errors: { Local: ['Local obrigatório.'] } } }))).toBe('Dados inválidos. Local obrigatório.');
  });
});

describe('Eventos: HTTP, consultas e concorrência de navegação', () => {
  let http: HttpTestingController;
  const acesso = { tem: vi.fn(() => true) };
  beforeEach(() => {
    acesso.tem.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: PermissoesService, useValue: acesso }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function pagina() {
    const fixture = TestBed.createComponent(Eventos);
    fixture.componentInstance.ngOnInit();
    return fixture.componentInstance;
  }
  it('consulta futuros separadamente, filtra passado e ordena cronologicamente', () => {
    const p = pagina();
    const req = http.expectOne(r => r.url.endsWith('/Eventos'));
    expect(req.request.params.get('dataInicial')).toBe(p.hoje);
    expect(req.request.params.get('dataFinal')).toBe(somarDias(p.hoje, 365));
    req.flush(resposta([{ ...evento, id: 'futuro', dataEvento: somarDias(p.hoje, 45) }, { ...evento, dataEvento: p.hoje }, { ...evento, id: 'passado', dataEvento: somarDias(p.hoje, -1) }]));
    expect(p.proximos().map(e => e.id)).toEqual(['e1', 'futuro']);
  });
  it('cancela requisições obsoletas e evita consultas duplicadas ao mesmo período', () => {
    const p = pagina(); http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
    const a = { dataInicial: '2026-10-26', dataFinal: '2026-12-06' };
    const b = { dataInicial: '2026-11-30', dataFinal: '2027-01-03' };
    p.mudarPeriodo(a); const antiga = http.expectOne(r => r.params.get('dataInicial') === a.dataInicial);
    p.mudarPeriodo(b); expect(antiga.cancelled).toBe(true);
    const atual = http.expectOne(r => r.params.get('dataInicial') === b.dataInicial);
    p.mudarPeriodo(b); http.expectNone(r => r.url.endsWith('/Eventos'));
    expect(p.carregando()).toBe(true); atual.flush(resposta([evento]));
    expect(p.eventos()).toEqual([evento]); expect(p.carregando()).toBe(false);
  });
  it('erro não vira vazio e atualização recarrega ambas as listas', () => {
    const p = pagina(); http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
    p.mudarPeriodo({ dataInicial: '2026-11-01', dataFinal: '2026-11-30' });
    http.expectOne(r => r.params.get('dataInicial') === '2026-11-01').flush({}, { status: 403, statusText: 'Forbidden' });
    expect(p.erro()).toContain('permissão'); expect(p.carregando()).toBe(false);
    p.recarregar(); const reqs = http.match(r => r.url.endsWith('/Eventos')); expect(reqs).toHaveLength(2);
    reqs.forEach(r => r.flush(resposta())); expect(p.erro()).toBe(''); expect(p.eventos()).toEqual([]);
  });
  it('não consulta nem abre ações sem permissão dinâmica', () => {
    acesso.tem.mockReturnValue(false); const p = pagina();
    p.mudarPeriodo({ dataInicial: '2026-11-01', dataFinal: '2026-11-30' }); p.recarregar(); p.selecionarDia('2026-11-19'); p.selecionarEvento('e1');
    http.expectNone(r => r.url.endsWith('/Eventos')); expect(p.modal()).toBeNull();
  });
  it('seleciona pelo ID, abre no segundo clique e não confunde títulos iguais', () => {
    const p = pagina(); http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
    p.eventos.set([evento, { ...evento, id: 'e2' }]);
    p.selecionarEvento('e1'); expect(p.selectedEventId()).toBe('e1'); expect(p.modal()).toBeNull();
    p.selecionarEvento('e2'); expect(p.selectedEventId()).toBe('e2'); expect(p.modal()).toBeNull();
    p.selecionarEvento('e2'); expect(p.modal()?.id).toBe('e2');
    http.expectNone(r => r.url.includes('/Eventos/'));
  });
  it('mantém eventos fora dos próximos acessíveis e limpa ao escolher um dia', () => {
    const p = pagina(); http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
    p.eventos.set([evento]); p.selecionarEvento('e1'); p.selecionarEvento('e1');
    expect(p.proximos()).toEqual([]); expect(p.modal()?.id).toBe('e1');
    p.modal.set(null); p.selecionarDia('2026-11-19');
    expect(p.selectedEventId()).toBeNull(); expect(p.modal()).toEqual({ id: null, data: '2026-11-19' });
  });
  it('preserva seleção ao atualizar e limpa se desaparecer ou navegar para outro período', () => {
    const p = pagina(); http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
    p.mudarPeriodo({ dataInicial: '2026-11-01', dataFinal: '2026-11-30' });
    http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta([evento]));
    p.selecionarEvento('e1'); p.recarregar();
    expect(p.selectedEventId()).toBe('e1');
    http.match(r => r.url.endsWith('/Eventos')).forEach(r => r.flush(resposta([evento])));
    expect(p.selectedEventId()).toBe('e1');
    p.recarregar(); http.match(r => r.url.endsWith('/Eventos')).forEach(r => r.flush(resposta()));
    expect(p.selectedEventId()).toBeNull();
    p.eventos.set([evento]); p.selecionarEvento('e1');
    p.mudarPeriodo({ dataInicial: '2027-01-01', dataFinal: '2027-01-31' });
    expect(p.selectedEventId()).toBeNull();
    http.expectOne(r => r.url.endsWith('/Eventos')).flush(resposta());
  });
  it('envia UUID no POST, versão no PUT e versão/motivo no DELETE', () => {
    const api = TestBed.inject(EventosService);
    const { id, versao, membros, local, dataEvento, transporte, alimentacao, seguroObrigatorio } = evento;
    const conteudo = { titulo: 'Reunião do clube', descricao: null, membros, local, dataEvento, transporte, alimentacao, seguroObrigatorio };
    api.criar(conteudo, '10000000-0000-4000-8000-000000000001').subscribe();
    const post = http.expectOne('/api/Eventos'); expect(post.request.headers.get('Idempotency-Key')).toBe('10000000-0000-4000-8000-000000000001'); expect(post.request.body).toEqual(conteudo); post.flush(evento);
    api.editar(id, { ...conteudo, versao }).subscribe();
    const put = http.expectOne('/api/Eventos/e1'); expect(put.request.method).toBe('PUT'); expect(put.request.body.versao).toBe(versao); put.flush(evento);
    api.excluir(id, versao, 'Cancelado').subscribe();
    const del = http.expectOne('/api/Eventos/e1'); expect(del.request.method).toBe('DELETE'); expect(del.request.body).toEqual({ versao, motivo: 'Cancelado' }); del.flush(null);
  });
  it('serviço de estorno codifica os dois IDs e envia somente o contrato confirmado sem retry', () => {
    const api = TestBed.inject(EventosService), erro = vi.fn();
    api.estornarParticipante('evento/grupo', 'membro/alvo', { versao: 'opaca', motivo: 'Cancelamento' }).subscribe({ error: erro });
    const req = http.expectOne('/api/Eventos/evento%2Fgrupo/Participantes/membro%2Falvo/Estorno');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ versao: 'opaca', motivo: 'Cancelamento' });
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    req.error(new ProgressEvent('error')); expect(erro).toHaveBeenCalledOnce();
    http.expectNone(r => r.method === 'POST');
  });

});
