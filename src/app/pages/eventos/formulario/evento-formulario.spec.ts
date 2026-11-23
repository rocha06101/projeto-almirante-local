import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { throwError, TimeoutError } from 'rxjs';
import { EventoDto } from '../../../core/models/evento.model';
import { MembroResumo } from '../../../core/models/user.model';
import { EventosService } from '../../../core/services/eventos';
import { PermissoesService } from '../../../core/services/permissoes';
import { ToastService } from '../../../core/services/toast.service';
import { EventoFormulario } from './evento-formulario';

const evento: EventoDto = {
  id: 'e1', eventoGrupoId: 'g1', eventoReferenciaId: null, dataEvento: '2026-11-17',
  titulo: 'Reunião do clube', descricao: 'Abertura\nAtividades', local: 'Igreja', membros: ['m1', 'm2'], quantidadeMembros: 2,
  transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 }, seguroObrigatorio: 5,
  valorPorMembro: 5, total: 10, versao: 'AAAAAAAABAA=', ativo: true, lancamentos: [],
};
const membros: MembroResumo[] = [
  { id: 'm1', nome: 'Ana', role: 'DS', cargo: 'Nome de exibição personalizado' },
  { id: 'm2', nome: 'Bruno', role: 'TES', cargo: 'Tesoureiro' },
  { id: 'm3', nome: 'Caio', role: 'DS', cargo: 'Desbravador' },
  { id: 'm4', nome: 'Dani', role: 'ALM', cargo: 'Almoxarife' },
  { id: 'm5', nome: 'Eva', role: 'ADM', cargo: 'Administrador' },
];

describe('Formulário de eventos: efeitos financeiros e confirmação', () => {
  let http: HttpTestingController;
  const acesso = { tem: vi.fn(() => true) };
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
  beforeEach(() => {
    acesso.tem.mockReturnValue(true); vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: PermissoesService, useValue: acesso }, { provide: ToastService, useValue: toast }] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  function formulario(edicao = false, falhaMembros = false) {
    const fixture = TestBed.createComponent(EventoFormulario), c = fixture.componentInstance;
    c.data = '2026-11-17'; c.dataMinima = '2026-11-01'; c.evento = edicao ? structuredClone(evento) : null;
    c.ngOnInit();
    http.match('/api/Membros').forEach(r => {
      if (falhaMembros) r.flush({}, { status: 503, statusText: 'Unavailable' });
      else r.flush([...membros, membros[0]]);
    });
    http.match(r => r.url === '/api/Eventos').forEach(r => r.flush({ items: [], dataMinimaCadastro: '2026-11-01' }));
    return { c, fixture };
  }
  function revisar(c: EventoFormulario) {
    c.modelo.titulo = 'Reunião do clube'; c.modelo.local = 'Igreja'; c.modelo.membros = ['m1'];
    c.seguroAtivo = true; c.modelo.seguroObrigatorio = 5;
    c.revisar();
  }
  it('carregamento e busca não são alterações; campos, grupos e custos são protegidos', () => {
    const { c } = formulario(true);
    expect(c.temAlteracoes()).toBe(false);
    c.busca = 'Ana'; c.carregarMembros(); http.expectOne('/api/Membros').flush(membros);
    expect(c.temAlteracoes()).toBe(false);
    c.modelo.titulo = 'Outro título'; expect(c.temAlteracoes()).toBe(true);
    c.modelo.titulo = evento.titulo!; expect(c.temAlteracoes()).toBe(false);
    c.selecionarGrupo('todos', true); expect(c.temAlteracoes()).toBe(true);
    c.modelo.membros = [...evento.membros]; expect(c.temAlteracoes()).toBe(false);
    c.seguroAtivo = false; expect(c.temAlteracoes()).toBe(true);
  });
  it('usa a data selecionada, normaliza custos gratuitos e não salva antes de confirmação', () => {
    const { c } = formulario(); expect(c.modelo.dataEvento).toBe('2026-11-17');
    c.modelo.transporte.valor = 99; c.modelo.alimentacao.valor = 40; revisar(c);
    expect(c.porMembro()).toBe(5); expect(c.total()).toBe(5);
    c.salvar(); http.expectNone(r => r.method === 'POST');
    c.confirmado = true; c.salvar(); c.salvar();
    const req = http.expectOne('/api/Eventos');
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.request.body.transporte.valor).toBe(0); expect(req.request.body.alimentacao.valor).toBe(0);
    expect(req.request.body).not.toHaveProperty('total'); expect(req.request.body).not.toHaveProperty('versao');
    req.flush(evento); expect(toast.success).toHaveBeenCalled();
  });
  it('recupera a operação pendente ao reabrir e repete a chave e corpo exatos', () => {
    const { c, fixture } = formulario(); revisar(c); c.confirmado = true; c.salvar();
    const primeira = http.expectOne('/api/Eventos'); const chave = primeira.request.headers.get('Idempotency-Key'); const body = primeira.request.body;
    primeira.flush({}, { status: 503, statusText: 'Unavailable' }); fixture.destroy();
    const segunda = formulario().c;
    expect(segunda.confirmando).toBe(true); expect(segunda.modelo).toEqual(body);
    segunda.confirmado = true; segunda.salvar(); const req = http.expectOne('/api/Eventos');
    expect(req.request.headers.get('Idempotency-Key')).toBe(chave); expect(req.request.body).toEqual(body); req.flush(evento);
    expect(TestBed.inject(EventosService).cadastroPendente()).toBeNull();
  });
  it.each([400, 401, 403, 404])('trata HTTP %s sem sucesso nem repetição automática', status => {
    const { c } = formulario(); revisar(c); c.confirmado = true; c.salvar();
    http.expectOne('/api/Eventos').flush({ detail: 'Falha informada pelo servidor.' }, { status, statusText: 'Error' });
    expect(c.erro()).not.toBe(''); expect(c.salvando()).toBe(false); expect(c.confirmando).toBe(false);
    expect(toast.error).toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled();
    http.expectNone(r => r.method === 'POST');
  });
  it('409 legado oferece GET do cadastro existente e não repete POST', () => {
    const { c } = formulario(); revisar(c); c.confirmado = true; c.salvar();
    http.expectOne('/api/Eventos').flush({ codigo: 'EVENTO_IDEMPOTENCIA_SEM_RESPOSTA_ORIGINAL', eventoId: 'e1' }, { status: 409, statusText: 'Conflict' });
    c.salvar(); http.expectNone(r => r.method === 'POST');
    const salvo = vi.fn(); c.salvo.subscribe(salvo); c.consultarExistente(); http.expectOne('/api/Eventos/e1').flush(evento);
    expect(salvo).toHaveBeenCalledWith(evento); expect(TestBed.inject(EventosService).cadastroPendente()).toBeNull();
  });
  it('edição exige motivo para remoção e não sobrescreve após conflito', () => {
    const { c } = formulario(true); c.modelo.membros = ['m1']; c.revisar();
    expect(c.confirmando).toBe(false); expect(c.erro()).toContain('motivo');
    c.motivo = ' Cancelou '; c.revisar(); c.confirmado = true; c.salvar();
    const req = http.expectOne('/api/Eventos/e1'); expect(req.request.body.motivo).toBe('Cancelou'); expect(req.request.body.versao).toBe(evento.versao);
    expect(req.request.body).not.toHaveProperty('eventoReferenciaId');
    req.flush({}, { status: 409, statusText: 'Conflict' }); expect(c.conflito()).toBe(true);
    c.salvar(); http.expectNone(r => r.method === 'PUT');
  });
  it('respeita permissão revogada entre revisão e confirmação', () => {
    const { c } = formulario(); revisar(c); c.confirmado = true; acesso.tem.mockReturnValue(false); c.salvar();
    http.expectNone(r => r.method === 'POST');
  });
  it('bloqueia valores inválidos, remoção sem motivo e data anterior à mínima', () => {
    const { c } = formulario(); c.modelo.titulo = 'Reunião do clube'; c.modelo.local = 'Igreja';
    c.modelo.membros = ['m1']; c.seguroAtivo = true; c.modelo.seguroObrigatorio = -1;
    c.revisar(); expect(c.confirmando).toBe(false);
    c.modelo.seguroObrigatorio = 1.001; c.revisar(); expect(c.confirmando).toBe(false);
    c.modelo.seguroObrigatorio = 0; c.modelo.dataEvento = '2026-10-31'; c.revisar(); expect(c.erro()).toContain('data mínima');
  });
  it('valida título e descrição conforme o contrato', () => {
    const { c } = formulario();
    c.modelo.local = 'Igreja';
    c.selecionarGrupo('desbravadores', true);
    c.modelo.titulo = '   ';
    c.revisar();
    expect(c.erro()).toContain('título');
    c.modelo.titulo = 'A'.repeat(151);
    c.revisar();
    expect(c.erro()).toContain('150');
    c.modelo.titulo = 'Reunião do clube';
    c.modelo.descricao = 'A'.repeat(2001);
    c.revisar();
    expect(c.erro()).toContain('2000');
    c.modelo.descricao = 'Atividades 🌳';
    c.revisar();
    expect(c.erro()).toContain('caracteres não suportados');
    expect(c.confirmando).toBe(false);
  });
  it('inicia sem seleção e preserva exclusões individuais ao alternar grupos', () => {
    const { c } = formulario();
    expect(c.modelo.membros).toEqual([]);
    expect(c.membrosVisiveis()).toEqual(membros);
    expect(c.grupos.map(g => c.estadoGrupo(g.id))).toEqual(['vazio', 'vazio', 'vazio']);
    c.selecionarGrupo('desbravadores', true);
    expect(c.modelo.membros).toEqual(['m1', 'm3']);
    c.selecionarMembro('m3', false);
    c.selecionarGrupo('diretoria', true);
    expect(c.modelo.membros).toEqual(['m1', 'm2', 'm4', 'm5']);
    expect(c.membrosVisiveis().map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(c.grupos.map(g => c.estadoGrupo(g.id))).toEqual(['parcial', 'completo', 'parcial']);
    c.selecionarGrupo('diretoria', false);
    expect(c.modelo.membros).toEqual(['m1']);
    expect(c.membrosVisiveis()).toEqual(membros);
    http.expectNone('/api/Membros');
  });

  it.each([0, 1, 2, membros.length])('mantém a busca acessível com %i participantes no catálogo', async quantidade => {
    const fixture = TestBed.createComponent(EventoFormulario);
    const c = fixture.componentInstance;
    const selecionarGrupo = vi.spyOn(c, 'selecionarGrupo');
    fixture.detectChanges();
    http.expectOne('/api/Membros').flush(membros.slice(0, quantidade));
    await fixture.whenStable();
    fixture.detectChanges();

    const tela = fixture.nativeElement as HTMLElement;
    const busca = tela.querySelector<HTMLInputElement>('input[name="busca"]')!;
    const opcoes = () => tela.querySelectorAll<HTMLInputElement>('.member-list input');
    const buscar = (nome: string) => {
      busca.value = nome;
      busca.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    };

    expect(busca.matches(':disabled')).toBe(false);
    expect(opcoes()).toHaveLength(quantidade);
    expect(c.modelo.membros).toEqual([]);
    if (quantidade === 0) expect(tela.textContent).toContain('Nenhum participante encontrado');

    buscar('Sem resultado');
    expect(tela.querySelector('input[name="busca"]')).toBe(busca);
    expect(busca.matches(':disabled')).toBe(false);
    expect(tela.textContent).toContain('Nenhum participante encontrado');
    expect(opcoes()).toHaveLength(0);

    const escolhidos = membros.slice(0, Math.min(2, quantidade));
    for (const membro of escolhidos) {
      buscar(`  ${membro.nome.toUpperCase()}  `);
      expect(opcoes()).toHaveLength(1);
      opcoes()[0].click();
      fixture.detectChanges();
      expect(opcoes()[0].checked).toBe(true);
    }
    buscar('');
    expect(opcoes()).toHaveLength(quantidade);
    expect(c.modelo.membros).toEqual(escolhidos.map(membro => membro.id));
    expect(selecionarGrupo).not.toHaveBeenCalled();
  });

  it('mantém a busca habilitada na edição com pagamento e desabilita alterações bloqueadas', async () => {
    const fixture = TestBed.createComponent(EventoFormulario);
    fixture.componentRef.setInput('evento', {
      ...evento, dataEvento: '2099-01-01',
      lancamentos: [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Pago' }],
    } satisfies EventoDto);
    fixture.detectChanges();
    http.expectOne('/api/Membros').flush(membros);
    await fixture.whenStable();
    fixture.detectChanges();

    const tela = fixture.nativeElement as HTMLElement;
    const busca = tela.querySelector<HTMLInputElement>('input[name="busca"]')!;
    expect(busca.matches(':disabled')).toBe(false);
    const opcoes = tela.querySelectorAll<HTMLInputElement>('.member-list input');
    expect(opcoes[0].checked).toBe(true);
    expect(opcoes[0].disabled).toBe(true);
    expect(opcoes[2].disabled).toBe(true);
    expect(opcoes[1].disabled).toBe(false);
    opcoes[1].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.modelo.membros).toEqual(['m1']);
  });
  it('seleciona todos sem duplicar IDs e envia somente os que permanecem marcados', () => {
    const { c } = formulario();
    c.selecionarGrupo('todos', true);
    expect(c.modelo.membros).toHaveLength(5);
    expect(c.grupos.map(g => c.estadoGrupo(g.id))).toEqual(['completo', 'completo', 'completo']);
    c.selecionarMembro('m3', false);
    expect(c.estadoGrupo('todos')).toBe('parcial');
    c.modelo.titulo = '  Reunião   do clube  ';
    c.modelo.descricao = '  Abertura\r\nAtividades\rEncerramento  ';
    c.modelo.local = 'Igreja';
    c.revisar();
    c.confirmado = true;
    c.salvar();
    const req = http.expectOne('/api/Eventos');
    expect(req.request.body).toMatchObject({
      titulo: 'Reunião do clube', descricao: 'Abertura\nAtividades\nEncerramento', membros: ['m1', 'm2', 'm4', 'm5'],
    });
    req.flush(evento);
  });
  it.each([false, true])('preserva participantes da edição com falha de catálogo: %s', falha => {
    const { c } = formulario(true, falha);
    expect(c.modelo).toMatchObject({ titulo: evento.titulo, descricao: evento.descricao, membros: ['m1', 'm2'] });
    expect(c.membrosVisiveis().map(m => m.id)).toEqual(falha ? ['m1', 'm2'] : membros.map(m => m.id));
    expect(c.seguroAtivo).toBe(true);
    if (!falha) expect(c.estadoGrupo('todos')).toBe('parcial');
    else {
      c.selecionarGrupo('todos', true);
      expect(c.modelo.membros).toEqual(['m1', 'm2']);
    }
  });
  it('ignora o seguro desativado na validação, no total e no payload', () => {
    const { c } = formulario();
    expect(c.seguroAtivo).toBe(false);
    c.modelo.titulo = 'Reunião do clube';
    c.modelo.descricao = '  ';
    c.modelo.local = 'Igreja';
    c.selecionarGrupo('diretoria', true);
    c.modelo.transporte = { ehGratis: false, valor: 12 };
    c.modelo.alimentacao = { individual: true, valor: 7 };
    c.modelo.seguroObrigatorio = -1;
    expect(c.porMembro()).toBe(12);
    c.revisar();
    c.confirmado = true;
    c.salvar();
    const req = http.expectOne('/api/Eventos');
    expect(req.request.body).toMatchObject({
      seguroObrigatorio: 0, descricao: null, transporte: { ehGratis: false, valor: 12 },
      alimentacao: { individual: true, valor: 0 },
    });
    req.flush(evento);
  });
  it('pede motivo ao desativar o seguro quando isso cancela cobranças existentes', () => {
    const { c } = formulario(true);
    c.evento!.lancamentos = [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Pendente' }];
    c.seguroAtivo = false;
    c.revisar();
    expect(c.erro()).toContain('motivo');
    c.motivo = 'Seguro dispensado';
    c.revisar();
    c.confirmado = true;
    c.salvar();
    const req = http.expectOne('/api/Eventos/e1');
    expect(req.request.body).toMatchObject({ seguroObrigatorio: 0, motivo: 'Seguro dispensado', membros: ['m1', 'm2'] });
    req.flush(evento);
  });
  function pagar(c: EventoFormulario) {
    c.evento!.lancamentos = [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Pago' }];
    c.evento!.devolucoes = [];
  }
  it.each([3, 0])('aceita redução para %s com motivo e preserva o pagamento original', valor => {
    const { c } = formulario(true); pagar(c);
    const original = structuredClone(c.evento!.lancamentos);
    c.modelo.seguroObrigatorio = valor;
    c.revisar(); expect(c.confirmando).toBe(false); expect(c.erro()).toContain('motivo');
    c.motivo = ' Patrocínio '; c.revisar(); expect(c.confirmando).toBe(true);
    c.confirmado = true; c.salvar(); c.salvar();
    const req = http.expectOne('/api/Eventos/e1');
    expect(req.request.body).toMatchObject({ seguroObrigatorio: valor, motivo: 'Patrocínio', versao: evento.versao });
    expect(req.request.body).not.toHaveProperty('lancamentos');
    expect(req.request.body).not.toHaveProperty('devolucoes');
    const salvo = vi.fn(); c.salvo.subscribe(salvo);
    const resposta = { ...c.evento!, seguroObrigatorio: valor, valorPorMembro: valor, versao: 'nova' };
    req.flush(resposta);
    expect(salvo).toHaveBeenCalledWith(resposta); expect(c.evento!.lancamentos).toEqual(original);
  });
  it('aceita aumentar um componente quando o total diminui, mas rejeita aumento ou composição com mesmo total', () => {
    const { c } = formulario(true); pagar(c);
    c.modelo.seguroObrigatorio = 6; c.revisar(); expect(c.confirmando).toBe(false);
    expect(c.erro()).toContain('precisa diminuir');
    c.modelo.seguroObrigatorio = 3; c.modelo.transporte = { ehGratis: false, valor: 2 };
    c.revisar(); expect(c.confirmando).toBe(false); expect(c.erro()).toContain('mesmo total');
    c.modelo.transporte.valor = 1; c.motivo = 'Patrocínio'; c.revisar(); expect(c.confirmando).toBe(true);
  });
  it('Atrasado permite edição de custos e data; somente Pago restringe', () => {
    const { c } = formulario(true);
    c.evento!.lancamentos = [{ id: 'l1', membroId: 'm1', valor: 5, status: 'Atrasado' }];
    c.modelo.seguroObrigatorio = 6; c.modelo.dataEvento = '2026-11-20'; c.revisar();
    expect(c.confirmando).toBe(true); c.confirmado = true; c.salvar();
    http.expectOne('/api/Eventos/e1').flush(evento);
  });
  it('bloqueia adição e data com Pago mesmo por alteração programática', () => {
    const { c } = formulario(true); pagar(c);
    c.selecionarMembro('m3', true); expect(c.modelo.membros).not.toContain('m3');
    c.modelo.membros.push('m3'); c.revisar(); expect(c.confirmando).toBe(false);
    c.modelo.membros = ['m1', 'm2']; c.modelo.dataEvento = '2026-12-01';
    c.revisar(); expect(c.confirmando).toBe(false); expect(c.erro()).toContain('data');
  });
  it('não bloqueia remoção de outro membro sem pagamento e exige motivo', () => {
    const { c } = formulario(true); pagar(c);
    c.evento!.dataEvento = c.modelo.dataEvento = '2099-01-01';
    c.selecionarMembro('m1', false); expect(c.modelo.membros).toContain('m1');
    c.selecionarMembro('m2', false); expect(c.modelo.membros).toEqual(['m1']);
    c.motivo = 'Cancelamento'; c.revisar(); expect(c.confirmando).toBe(true);
  });
  it.each(['', '   ', 'x'.repeat(256), 'Motivo 😀', 'Duas\nlinhas', 'Uma\ttabulação'])('valida motivo na revisão: %j', motivo => {
    const { c } = formulario(true); pagar(c);
    c.modelo.seguroObrigatorio = 0; c.motivo = motivo; c.revisar(); expect(c.confirmando).toBe(false);
  });
  it.each(['valor', 'membros', 'motivo', 'versao'])('invalida revisão se %s mudar antes de salvar', campo => {
    const { c } = formulario(true); c.revisar(); c.confirmado = true;
    if (campo === 'valor') c.modelo.seguroObrigatorio = 2;
    if (campo === 'membros') c.modelo.membros = ['m1'];
    if (campo === 'motivo') c.motivo = 'Alterado';
    if (campo === 'versao') c.evento!.versao = 'outra';
    c.salvar(); http.expectNone(r => r.method === 'PUT');
    expect(c.confirmando).toBe(false); expect(c.erro()).toContain('Revise novamente');
  });
  it.each([0, 500, 503])('edição com resposta incerta %s exige consulta antes de repetir', status => {
    const { c } = formulario(true); c.revisar(); c.confirmado = true; c.salvar();
    const req = http.expectOne('/api/Eventos/e1');
    if (status === 0) req.error(new ProgressEvent('error')); else req.flush({}, { status, statusText: 'Erro' });
    expect(c.incerto()).toBe(true); expect(toast.success).not.toHaveBeenCalled();
    c.salvar(); c.revisar(); http.expectNone(r => r.method === 'PUT');
  });
  it('redução sucessiva usa valor e versão obtidos do servidor sem acumular devoluções locais', () => {
    const { c } = formulario(true); pagar(c);
    c.evento!.valorPorMembro = 3; c.evento!.seguroObrigatorio = 3; c.evento!.versao = 'apos-primeira-reducao';
    c.modelo.seguroObrigatorio = 0; c.motivo = 'Novo patrocínio'; c.revisar(); c.confirmado = true; c.salvar();
    const req = http.expectOne('/api/Eventos/e1');
    expect(req.request.body.versao).toBe('apos-primeira-reducao');
    expect(req.request.body).not.toHaveProperty('devolucoes'); req.flush(c.evento);
  });

  it.each([NaN, Infinity, -Infinity, -0.01, 0.001])('rejeita custo inválido %s antes da confirmação', valor => {
    const { c } = formulario(true); c.modelo.seguroObrigatorio = valor;
    c.revisar(); expect(c.confirmando).toBe(false); expect(c.erro()).toContain('custos válidos');
  });
  it('timeout na edição bloqueia reenvio e oferece reconciliação', () => {
    const { c } = formulario(true);
    const editar = vi.spyOn(c.api, 'editar').mockReturnValue(throwError(() => new TimeoutError()));
    c.revisar(); c.confirmado = true; c.salvar(); c.salvar();
    expect(editar).toHaveBeenCalledOnce(); expect(c.incerto()).toBe(true);
    expect(c.erro()).toContain('Consulte os dados atuais'); expect(toast.success).not.toHaveBeenCalled();
  });

  it('conta apenas mudanças coletivas bloqueadas, mantém grupo misto e permite reseleção de membro original', () => {
    const { c } = formulario(true);
    pagar(c);
    c.evento!.dataEvento = c.modelo.dataEvento = '2099-01-01';
    const caixa = document.createElement('input');
    caixa.type = 'checkbox';
    caixa.checked = true;
    c.mudarSelecaoGrupo('todos', caixa);
    expect(c.feedbackSelecao()).toContain('3 participantes não foram incluídos');
    expect(c.modelo.membros).toEqual(['m1', 'm2']);
    expect(caixa.indeterminate).toBe(true);
    expect(caixa.checked).toBe(true);
    caixa.checked = false;
    c.mudarSelecaoGrupo('todos', caixa);
    expect(c.feedbackSelecao()).toContain('1 participante não foi removido');
    expect(c.modelo.membros).toEqual(['m1']);
    expect(c.membrosVisiveis().map(m => m.id)).toContain('m2');
    c.selecionarMembro('m2', true);
    c.selecionarGrupo('todos', true); c.selecionarGrupo('todos', true);
    expect(c.modelo.membros).toEqual(['m1', 'm2']);
    c.selecionarMembro('m1', false);
    expect(c.modelo.membros).toEqual(['m1', 'm2']);
  });

  it.each([
    ['2099-01-01', 'Pendente', false],
    ['2099-01-01', 'Pago', true],
    ['2000-01-01', 'Pendente', true],
  ] as const)('remoção em %s com devolução %s permitida: %s', (data, status, permitida) => {
    const { c } = formulario(true);
    pagar(c);
    c.evento!.dataEvento = c.modelo.dataEvento = data;
    c.evento!.devolucoes = [{ id: 'd1', membroId: 'm1', lancamentoOrigemId: 'l1', valor: 2,
      vencimento: data, status, valorDevolvido: status === 'Pago' ? 2 : null, dataDevolucao: null,
      motivo: 'Devolução', justificativa: null }];
    c.selecionarGrupo('desbravadores', false);
    expect(c.modelo.membros.includes('m1')).toBe(!permitida);
    expect(c.modelo.membros).toContain('m2');
    expect(!!c.motivoBloqueioMembro('m1', false)).toBe(!permitida);
  });

});
