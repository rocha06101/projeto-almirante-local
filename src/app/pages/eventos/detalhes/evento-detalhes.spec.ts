import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { EventoDto } from '../../../core/models/evento.model';
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
      { provide: PermissoesService, useValue: acesso }, { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } }] });
    http = TestBed.inject(HttpTestingController);
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
});
