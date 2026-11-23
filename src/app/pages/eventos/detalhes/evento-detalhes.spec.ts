import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EMPTY, Subject, throwError } from 'rxjs';
import { EventoDto, EventoParticipante, MinhaDevolucao } from '../../../core/models/evento.model';
import { EventosService } from '../../../core/services/eventos';
import { NotificacoesService } from '../../../core/services/notificacoes';
import { PermissoesService } from '../../../core/services/permissoes';
import { ToastService } from '../../../core/services/toast.service';
import { EventoDetalhes } from './evento-detalhes';
import { EventoFormulario } from '../formulario/evento-formulario';

const evento: EventoDto = {
  id: 'e1', eventoGrupoId: 'g1', eventoReferenciaId: null, dataEvento: '2026-11-17', local: 'Igreja', membros: ['m1'], quantidadeMembros: 1,
  transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 }, seguroObrigatorio: 5,
  valorPorMembro: 5, total: 5, versao: 'AAAAAAAABAA=', ativo: true, lancamentos: [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Pendente' }],
};
describe('Detalhes: exclusão e carregamento atual', () => {
  let http: HttpTestingController;
  const acesso = { tem: vi.fn(() => true) };
  beforeEach(() => {
    acesso.tem.mockReturnValue(true);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: PermissoesService, useValue: acesso }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: NotificacoesService, useValue: { eventosAlterados$: EMPTY } }] });
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(EventosService), 'obterMeuEvento')
      .mockReturnValue(throwError(() => new HttpErrorResponse({ status: 404 })));
  });
  afterEach(() => http.verify());
  function detalhes() {
    const c = TestBed.createComponent(EventoDetalhes).componentInstance;
    c.id = 'e1'; c.ngOnInit(); http.expectOne('/api/Membros').flush([]);
    http.expectOne('/api/Eventos/e1').flush(evento);
    http.expectOne(r => r.url === '/api/Eventos').flush({ items: [evento], dataMinimaCadastro: '2026-11-01' });
    return c;
  }
  function formulario(c: EventoDetalhes, edicao = false) {
    const f = TestBed.createComponent(EventoFormulario).componentInstance;
    f.evento = edicao ? evento : null;
    f.data = '2026-11-19'; f.ngOnInit();
    http.expectOne('/api/Membros').flush([]);
    http.match(r => r.url === '/api/Eventos').forEach(r => r.flush({ items: [], dataMinimaCadastro: '2026-11-01' }));
    c.formulario = f;
    c.modo = edicao ? 'editar' : 'criar';
    return f;
  }
  it('fecha detalhes e formulário intacto sem confirmação nem mutações', () => {
    const c = detalhes(), fechar = vi.fn(); c.fechar.subscribe(fechar);
    c.sair(); expect(fechar).toHaveBeenCalledOnce();
    formulario(c, true); c.sair(); expect(fechar).toHaveBeenCalledTimes(2);
    expect(c.descarte).toBeNull();
    http.expectNone(r => r.method !== 'GET');
  });
  it('ignora clique interno e fecha somente pelo próprio backdrop', () => {
    const c = detalhes(), fechar = vi.fn(); c.fechar.subscribe(fechar);
    const backdrop = document.createElement('div'), interno = document.createElement('button');
    backdrop.append(interno); backdrop.addEventListener('click', e => c.cliqueBackdrop(e));
    interno.click(); expect(fechar).not.toHaveBeenCalled();
    backdrop.click(); expect(fechar).toHaveBeenCalledOnce();
  });
  it.each([false, true])('protege alterações, permite continuar e confirmar descarte (edição: %s)', edicao => {
    const c = detalhes(), fechar = vi.fn(); c.fechar.subscribe(fechar);
    const f = formulario(c, edicao); f.modelo.titulo = 'Alteração não salva';
    c.sair(); expect(c.descarte).toBe('fechar'); expect(fechar).not.toHaveBeenCalled();
    c.continuarEditando(); expect(c.descarte).toBeNull(); expect(f.modelo.titulo).toBe('Alteração não salva');
    c.escape(new KeyboardEvent('keydown', { key: 'Escape' })); expect(c.descarte).toBe('fechar');
    c.escape(new KeyboardEvent('keydown', { key: 'Escape' })); expect(c.descarte).toBeNull();
    c.sair(); c.descartar(); expect(fechar).toHaveBeenCalledOnce();
    http.expectNone(r => r.method !== 'GET');
  });
  it('não fecha durante salvamento nem quando Escape já foi consumido por um controle', () => {
    const c = detalhes(), fechar = vi.fn(); c.fechar.subscribe(fechar);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }); escape.preventDefault();
    c.escape(escape); expect(fechar).not.toHaveBeenCalled();
    c.ocupado.set(true); c.sair(); expect(fechar).not.toHaveBeenCalled();
  });
  it('exige confirmação e motivo, bloqueia múltiplos cliques e só atualiza após sucesso', () => {
    const c = detalhes(), atualizado = vi.fn(); c.atualizado.subscribe(atualizado); c.pedirExclusao(); c.excluir();
    http.expectNone(r => r.method === 'DELETE');
    c.motivo = ' Cancelado '; c.confirmaExclusao = true; c.excluir(); c.excluir();
    const req = http.expectOne('/api/Eventos/e1'); expect(atualizado).not.toHaveBeenCalled();
    expect(req.request.body).toEqual({ motivo: 'Cancelado', versao: evento.versao }); req.flush(null);
    expect(atualizado).toHaveBeenCalledOnce();
  });
  it('409 bloqueia exclusão até recarregar versão atual', () => {
    const c = detalhes(); c.pedirExclusao(); c.motivo = 'Cancelado'; c.confirmaExclusao = true; c.excluir();
    http.expectOne('/api/Eventos/e1').flush({ detail: 'Versão alterada' }, { status: 409, statusText: 'Conflict' });
    expect(c.conflito()).toBe(true); c.excluir(); http.expectNone(r => r.method === 'DELETE');
    c.carregar(); http.expectOne('/api/Eventos/e1').flush({ ...evento, versao: 'nova' });
    http.expectOne(r => r.url === '/api/Eventos').flush({ items: [evento] }); expect(c.evento()?.versao).toBe('nova');
  });
  it('não exclui lançamentos pagos nem sem permissão', () => {
    const c = detalhes(); c.evento.set({ ...evento, lancamentos: [{ ...evento.lancamentos[0], status: 'Pago' }] }); c.pedirExclusao();
    expect(c.modo).toBe('detalhes'); c.motivo = 'Cancelado'; c.confirmaExclusao = true; c.excluir();
    c.evento.set(evento); acesso.tem.mockReturnValue(false); c.excluir(); http.expectNone(r => r.method === 'DELETE');
  });
  it('cancela detalhe anterior e apresenta 404 sem manter evento antigo', () => {
    const c = detalhes(); c.carregar('e2'); const antigo = http.expectOne('/api/Eventos/e2'); c.carregar('e3');
    expect(antigo.cancelled).toBe(true); http.expectOne('/api/Eventos/e3').flush({}, { status: 404, statusText: 'Not Found' });
    expect(c.evento()).toBeNull(); expect(c.erro()).toContain('não encontrado');
  });
  function pago(c: EventoDetalhes) {
    c.evento.set({ ...evento, titulo: 'Passeio', devolucoes: [], lancamentos: [{ ...evento.lancamentos[0], status: 'Pago' }] });
  }
  function devolucao(status: 'Pendente' | 'Pago' = 'Pendente') {
    return { id: 'd1', membroId: 'm1', lancamentoOrigemId: 'l1', valor: 2, vencimento: '2026-11-17', status,
      valorDevolvido: status === 'Pago' ? 1 : null, dataDevolucao: status === 'Pago' ? '2026-11-18' : null,
      motivo: 'Cancelamento', justificativa: status === 'Pago' ? 'Valor acordado' : null };
  }
  it('estorno usa somente membro e cadastro selecionados, motivo e versão; atualiza por GET', () => {
    const c = detalhes(); pago(c);
    const atualizado = vi.fn(); c.atualizado.subscribe(atualizado);
    c.pedirEstorno('de-outro-grupo'); expect(c.alvoEstorno).toBeNull();
    c.pedirEstorno('m1'); c.estornar(); http.expectNone(r => r.method === 'POST');
    c.motivo = ' Cancelamento '; c.confirmaEstorno = true; c.estornar(); c.estornar();
    const req = http.expectOne('/api/Eventos/e1/Participantes/m1/Estorno');
    expect(req.request.body).toEqual({ motivo: 'Cancelamento', versao: evento.versao });
    expect(atualizado).not.toHaveBeenCalled();
    req.flush({ ...c.evento(), devolucoes: [devolucao()], versao: 'nova' });
    expect(atualizado).toHaveBeenCalledOnce();
    expect(TestBed.inject(ToastService).success).toHaveBeenCalledWith('Solicitação de estorno registrada. A devolução aguarda processamento pela tesouraria.');
    expect(c.evento()).toBeNull();
    http.expectOne('/api/Eventos/e1').flush({ ...evento, devolucoes: [devolucao()], versao: 'mais-atual' });
    http.expectOne(r => r.url === '/api/Eventos').flush({ items: [evento] });
    expect(c.evento()?.versao).toBe('mais-atual'); expect(c.evento()?.devolucoes).toHaveLength(1);
    expect(c.evento()?.valorPorMembro).toBe(5);
  });
  it.each([400, 401, 403, 404, 409, 500, 0])('estorno trata %s sem sucesso nem repetição automática', status => {
    const c = detalhes(); pago(c); c.pedirEstorno('m1'); c.motivo = 'Cancelamento'; c.confirmaEstorno = true; c.estornar();
    const req = http.expectOne('/api/Eventos/e1/Participantes/m1/Estorno');
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush({ detail: status === 409 ? 'O valor já está em devolução.' : 'Operação rejeitada.' }, { status, statusText: 'Erro' });
    expect(c.erro()).not.toBe(''); expect(c.ocupado()).toBe(false);
    expect(TestBed.inject(ToastService).success).not.toHaveBeenCalled();
    expect(c.evento()?.devolucoes).toEqual([]);
    c.estornar(); http.expectNone(r => r.method === 'POST');
    if ([0, 500, 409].includes(status)) {
      c.confirmaEstorno = true; c.estornar(); http.expectNone(r => r.method === 'POST');
      c.carregar(); http.expectOne('/api/Eventos/e1').flush({ ...evento, versao: 'atual' });
      http.expectOne(r => r.url === '/api/Eventos').flush({ items: [evento] });
      expect(c.incerto()).toBe(false); expect(c.conflito()).toBe(false);
    }
    if (status === 409) expect(c.erro()).not.toContain('Versão');
  });
  it('nega estorno sem permissão, sem contrato #209 e após troca de grupo/versão', () => {
    const c = detalhes(); pago(c);
    acesso.tem.mockReturnValue(false); c.pedirEstorno('m1'); expect(c.alvoEstorno).toBeNull();
    acesso.tem.mockReturnValue(true); c.pedirEstorno('m1'); c.motivo = 'Cancelamento'; c.confirmaEstorno = true;
    c.evento.set({ ...c.evento()!, id: 'outro-grupo' }); c.estornar(); http.expectNone(r => r.method === 'POST');
    pago(c); c.evento.set({ ...c.evento()!, versao: 'alterada' }); c.estornar(); http.expectNone(r => r.method === 'POST');
    c.evento.set({ ...c.evento()!, devolucoes: undefined }); expect(c.podeEstornar('m1')).toBe(false);
  });
  it('inclui participante removido com pagamento no histórico e permite estorno avulso', () => {
    const c = detalhes(); pago(c); c.evento.set({ ...c.evento()!, membros: [] });
    expect(c.participantesComHistorico()).toEqual(['m1']); expect(c.podeEstornar('m1')).toBe(true);
  });
  it('exclusão bloqueada com devolução pendente; concluída submete à validação final do servidor', () => {
    const c = detalhes(); pago(c); c.evento.set({ ...c.evento()!, devolucoes: [devolucao()] });
    c.pedirExclusao(); expect(c.modo).toBe('detalhes');
    c.evento.set({ ...c.evento()!, devolucoes: [devolucao('Pago')] });
    c.pedirExclusao(); expect(c.modo).toBe('excluir');
    expect(c.liquidacaoConfirmavel(c.evento()!)).toBeNull();
    c.motivo = 'Cancelamento'; c.confirmaExclusao = true; c.excluir();
    http.expectOne('/api/Eventos/e1').flush({ detail: 'Ainda há valor retido.' }, { status: 409, statusText: 'Conflict' });
    expect(c.erro()).toBe('Ainda há valor retido.');
  });
  it('exclusão com resposta incerta impede reenvio e consulta falha não libera ação', () => {
    const c = detalhes(), atualizado = vi.fn(); c.atualizado.subscribe(atualizado);
    c.pedirExclusao(); c.motivo = 'Cancelado'; c.confirmaExclusao = true; c.excluir();
    http.expectOne('/api/Eventos/e1').error(new ProgressEvent('error'));
    c.confirmaExclusao = true; c.excluir(); http.expectNone(r => r.method === 'DELETE');
    c.carregar(); http.expectOne('/api/Eventos/e1').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(c.incerto()).toBe(true); expect(c.evento()).toBeNull();
    expect(atualizado).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).success).not.toHaveBeenCalled();
  });

  it('depois da baixa, exclusão usa versão atual e só fecha após 204 do servidor', () => {
    const c = detalhes(); pago(c);
    c.evento.set({ ...c.evento()!, versao: 'apos-baixa', devolucoes: [devolucao('Pago')] });
    const fechar = vi.fn(); c.fechar.subscribe(fechar);
    c.pedirExclusao(); c.motivo = 'Encerrado'; c.confirmaExclusao = true; c.excluir();
    const req = http.expectOne('/api/Eventos/e1'); expect(fechar).not.toHaveBeenCalled();
    expect(req.request.body).toEqual({ motivo: 'Encerrado', versao: 'apos-baixa' });
    req.flush(null, { status: 204, statusText: 'No Content' }); expect(fechar).toHaveBeenCalledOnce();
  });
  it('reconciliação da edição atualiza listagens e detalhes por consulta', () => {
    const c = detalhes(), atualizado = vi.fn(); c.atualizado.subscribe(atualizado);
    c.falhaEdicao('incerta'); c.carregar(); c.carregar(); c.carregar('e2');
    expect(atualizado).not.toHaveBeenCalled();
    http.expectNone('/api/Eventos/e2');
    http.expectOne('/api/Eventos/e1').flush({ ...evento, versao: 'apos-resposta-incerta' });
    expect(atualizado).toHaveBeenCalledOnce();
    expect(c.incerto()).toBe(false);
    expect(TestBed.inject(ToastService).success).not.toHaveBeenCalled();
    http.expectOne(r => r.url === '/api/Eventos').flush({ items: [evento] });
    expect(c.evento()?.versao).toBe('apos-resposta-incerta');
  });

  it('DELETE com resposta perdida e GET 404 mantém exclusão sem confirmação', () => {
    const c = detalhes(), atualizado = vi.fn(), fechar = vi.fn();
    c.atualizado.subscribe(atualizado); c.fechar.subscribe(fechar);
    c.pedirExclusao(); c.motivo = 'Cancelado'; c.confirmaExclusao = true; c.excluir();
    http.expectOne('/api/Eventos/e1').error(new ProgressEvent('error'));
    c.carregar();
    http.expectOne('/api/Eventos/e1').flush({ title: 'Evento não encontrado.' }, { status: 404, statusText: 'Not Found' });
    expect(c.incerto()).toBe(true); expect(c.evento()).toBeNull();
    expect(c.erro()).toContain('pode ter concluído a exclusão');
    expect(atualizado).not.toHaveBeenCalled();
    expect(fechar).not.toHaveBeenCalled();
    expect(TestBed.inject(ToastService).success).not.toHaveBeenCalled();
    c.pedirExclusao(); c.excluir();
    http.expectNone(r => r.method === 'DELETE');
  });

});

describe('Detalhes: minha situação financeira', () => {
  const pessoal: EventoParticipante = {
    id: evento.id, local: evento.local, dataEvento: evento.dataEvento,
    transporte: evento.transporte, alimentacao: evento.alimentacao,
    seguroObrigatorio: evento.seguroObrigatorio, valorPorMembro: evento.valorPorMembro,
    minhaCobranca: null,
  };
  const pendente: MinhaDevolucao = { valor: 20, vencimento: '2026-11-20', status: 'Pendente' };
  let http: HttpTestingController;
  let fixture: ComponentFixture<EventoDetalhes>;
  let avisos: Subject<string | null>;
  let acessoGeral: boolean;
  const secao = () => (fixture.nativeElement as HTMLElement).querySelector('.situacao-financeira');
  const texto = (el: Element | null) => el?.textContent.replace(/\s+/g, ' ').trim();
  const pedido = (id = evento.id) => http.expectOne({ url: `/api/Me/Eventos/${id}`, method: 'GET' });
  const responder = (dados: EventoParticipante) => { pedido(dados.id).flush(dados); fixture.detectChanges(); };

  beforeEach(() => {
    acessoGeral = false;
    avisos = new Subject<string | null>();
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: PermissoesService, useValue: { tem: (chave: string) => chave === 'eventos.consultar' && acessoGeral } },
      { provide: NotificacoesService, useValue: { eventosAlterados$: avisos } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(EventoDetalhes);
  });
  afterEach(() => {
    http.expectNone(req => req.method !== 'GET');
    http.verify();
  });

  function abrir(): void {
    fixture.componentRef.setInput('id', evento.id);
    fixture.detectChanges();
  }

  it.each(['Pendente', 'Pago', 'Atrasado'] as const)('mostra cobrança %s no modal existente', status => {
    abrir();
    const dialogo = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]');
    expect(texto(dialogo)).toContain('Consultando sua situação financeira');
    responder({ ...pessoal, minhaCobranca: { status, valor: 35.5, vencimento: '2026-11-17' } });

    expect(texto(dialogo)).toContain('Evento — Igreja');
    expect(texto(secao())).toContain('Minha situação financeira');
    expect(texto(secao())).toContain('Minha cobrança');
    expect(texto(secao())).toContain('R$ 35,50');
    expect(texto(secao()?.querySelector('.financeiro-estado') ?? null)).toBe(status);
    expect(texto(secao())).toContain('17 de novembro de 2026');
    expect(texto(secao())).not.toContain('Minhas devoluções');
    expect(texto(dialogo)).not.toMatch(/Participantes e lançamentos|Editar evento|Excluir evento|Solicitar estorno/);
    http.expectNone(req => /^\/api\/(Eventos|Membros)(\/|$)/.test(req.url));
  });

  it('mostra múltiplos registros e distingue valor esperado, devolvido e status oficial', () => {
    abrir();
    responder({ ...pessoal, minhasDevolucoes: [
      pendente,
      { ...pendente, status: 'Pago', valorDevolvido: 20 },
      { ...pendente, status: 'Pago', valorDevolvido: 12.5, dataDevolucao: '2026-11-19', justificativa: 'Valor acordado.' },
    ] });
    const registros = [...secao()!.querySelectorAll('.minhas-devolucoes li')];
    expect(registros).toHaveLength(3);
    expect(texto(registros[0])).toContain('Pendente');
    expect(texto(registros[0])).toContain('R$ 20,00');
    expect(texto(registros[0])).not.toContain('Valor devolvido');
    expect(texto(registros[1])).toContain('Valor devolvidoR$ 20,00');
    expect(texto(registros[2])).toContain('Paga');
    expect(texto(registros[2])).toContain('Valor esperadoR$ 20,00');
    expect(texto(registros[2])).toContain('Valor devolvidoR$ 12,50');
    expect(texto(registros[2])).toContain('19 de novembro de 2026');
    expect(texto(registros[2])).toContain('Valor acordado.');
  });

  it('oculta a situação pessoal para não participantes e mantém o detalhe autorizado', () => {
    acessoGeral = true;
    abrir();
    pedido().flush(null, { status: 404, statusText: 'Not Found' });
    http.expectOne('/api/Eventos/e1').flush(evento);
    http.expectOne(req => req.url === '/api/Eventos').flush({ items: [evento], dataMinimaCadastro: '2026-11-01' });
    fixture.detectChanges();
    expect(secao()).toBeNull();
    expect(texto(fixture.nativeElement)).toContain('Participantes e lançamentos');
    expect(texto(fixture.nativeElement)).not.toContain('Não foi possível consultar sua situação financeira');
  });

  it('usa a cobrança de autoatendimento quando o participante também pode consultar lançamentos gerais', () => {
    acessoGeral = true;
    abrir();
    http.expectOne('/api/Eventos/e1').flush({
      ...evento,
      lancamentos: [{ id: 'terceiro', membroId: 'm2', valor: 99, status: 'Pago' }],
    });
    http.expectOne(req => req.url === '/api/Eventos').flush({ items: [evento], dataMinimaCadastro: '2026-11-01' });
    responder({ ...pessoal, minhaCobranca: { valor: 25, status: 'Pendente', vencimento: pessoal.dataEvento } });
    expect(texto(secao())).toContain('R$ 25,00');
    expect(texto(secao())).not.toContain('R$ 99,00');
    expect(texto(fixture.nativeElement)).toContain('R$ 99,00');
  });

  it('permite repetir uma consulta financeira que falhou e renderiza dados vazios', () => {
    abrir();
    pedido().flush(null, { status: 503, statusText: 'Indisponível' });
    fixture.detectChanges();
    expect(secao()).toBeNull();
    const page = fixture.nativeElement as HTMLElement;
    expect(texto(page.querySelector('[role="alert"]'))).toContain('Não foi possível consultar sua situação financeira');
    [...page.querySelectorAll('button')].find(b => texto(b)?.includes('Tentar novamente'))!.click();
    responder(pessoal);
    expect(texto(secao())).toContain('Você não tem cobranças ou devoluções para este evento.');
  });

  it('atualiza apenas o evento aberto após aviso e ignora avisos após fechar o modal', async () => {
    abrir();
    responder(pessoal);
    avisos.next('outro-evento');
    expect(fixture.componentInstance.financeiro().estado).toBe('pronta');
    avisos.next(evento.id);
    avisos.next(evento.id);
    await vi.waitFor(() => expect(fixture.componentInstance.financeiro().estado).toBe('carregando'));
    responder({ ...pessoal, minhasDevolucoes: [pendente] });
    expect(texto(secao())).toContain('Minhas devoluções');

    avisos.next(null);
    await vi.waitFor(() => expect(fixture.componentInstance.financeiro().estado).toBe('carregando'));
    const emAndamento = pedido();
    const fechar = vi.fn(() => fixture.destroy());
    fixture.componentInstance.fechar.subscribe(fechar);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[aria-label="Fechar detalhes"]')!.click();
    expect(fechar).toHaveBeenCalledOnce();
    expect(emAndamento.cancelled).toBe(true);
    expect(avisos.observed).toBe(false);
  });

  it('cancela a consulta financeira do evento anterior ao mudar de evento', () => {
    abrir();
    const anterior = pedido();
    fixture.componentRef.setInput('id', 'e2');
    fixture.detectChanges();
    expect(anterior.cancelled).toBe(true);
    responder({ ...pessoal, id: 'e2', titulo: 'Outro evento' });
    expect(texto(fixture.nativeElement)).toContain('Outro evento');
  });
});
