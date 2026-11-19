import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { LancamentosService } from './lancamentos.service';
import { Lancamento } from '../models/lancamento.model';

/** Verifica o contrato de /api/Lancamentos (Swagger do backend). */
describe('LancamentosService', () => {
  let service: LancamentosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(LancamentosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lista com paginação e filtros nos nomes esperados pela API (finalidade/vencimento)', () => {
    service
      .list({ page: 2, pageSize: 10, search: 'campori', status: 'Pago', finalidade: 'Mensalidade', vencimento: '2026-08-10' })
      .subscribe();

    const req = http.expectOne(r => r.method === 'GET' && r.url === '/api/Lancamentos');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('search')).toBe('campori');
    expect(req.request.params.get('status')).toBe('Pago');
    expect(req.request.params.get('finalidade')).toBe('Mensalidade');
    expect(req.request.params.get('vencimento')).toBe('2026-08-10');
    req.flush({ items: [], total: 0, page: 2, pageSize: 10, totalPages: 1 });
  });

  it('não envia filtros "Todos" nem vazios', () => {
    service.list({ status: 'Todos', finalidade: 'Todos', search: '', vencimento: '' }).subscribe();

    const req = http.expectOne(r => r.url === '/api/Lancamentos');
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize']);
    req.flush({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
  });

  it('registra em POST /Lancamentos/Registrar', () => {
    service
      .registrar({ membroId: 'm1', finalidade: 'Mensalidade', categoria: 'Clube', tipoFluxo: 'Entrada', valor: 20, vencimento: '2026-08-10' })
      .subscribe();

    const req = http.expectOne('/api/Lancamentos/Registrar');
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    expect(req.request.body).toMatchObject({ membroId: 'm1', tipoFluxo: 'Entrada' });
    req.flush({});
  });

  it('lote (todos os membros) envia o header Idempotency-Key', () => {
    service
      .registrar(
        { aplicarATodosOsMembros: true, finalidade: 'Mensalidade', categoria: 'Clube', tipoFluxo: 'Entrada', valor: 20, vencimento: '2026-08-10' },
        'chave-1',
      )
      .subscribe();

    const req = http.expectOne('/api/Lancamentos/Registrar');
    expect(req.request.headers.get('Idempotency-Key')).toBe('chave-1');
    req.flush({ operacaoId: 'o', usuariosProcessados: 3, lancamentosCriados: 3, dataHoraUtc: '2026-01-01T00:00:00Z' });
  });

  it('atualiza em PUT /Lancamentos/{id}', () => {
    service.update('abc', { status: 'Pago' }).subscribe();
    const req = http.expectOne('/api/Lancamentos/abc');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ status: 'Pago' });
    req.flush({});
  });

  const devolucao: Lancamento = {
    id: 'devolucao', membroId: 'm1', membroNome: 'Guilherme', finalidade: null, descricao: null,
    categoria: 'Evento', tipoFluxo: 'Saida', valor: 252, vencimento: '2026-11-17',
    status: 'Pago', eventoId: 'ev1', lancamentoOrigemId: 'pagamento-original',
    valorPago: 200, dataPagamento: '2026-11-18', devolucaoJustificativa: 'Valor acordado',
  };

  it.each([
    ['POST', 'registrarDevolucao'],
    ['PUT', 'corrigirDevolucao'],
  ] as const)('envia %s ao endpoint dedicado e retorna o LancamentoDto', (verb, operacao) => {
    const payload = { dataPagamento: '2026-11-18', valorPago: 200, justificativa: 'Valor acordado' };
    const resposta = vi.fn();
    service[operacao](devolucao.id, payload).subscribe(resposta);

    const req = http.expectOne({ method: verb, url: '/api/Lancamentos/devolucao/Devolucao' });
    expect(req.request.body).toEqual(payload);
    expect(req.request.headers.has('Idempotency-Key')).toBe(false);
    http.expectNone('/api/Lancamentos/pagamento-original');
    req.flush(devolucao);
    expect(resposta).toHaveBeenCalledExactlyOnceWith(devolucao);
  });

  it('consulta a devolução por ID para reconciliar o estado persistido', () => {
    const resposta = vi.fn();
    service.getById(devolucao.id).subscribe(resposta);
    http.expectOne({ method: 'GET', url: '/api/Lancamentos/devolucao' }).flush(devolucao);
    expect(resposta).toHaveBeenCalledExactlyOnceWith(devolucao);
  });

  it('exclui em DELETE /Lancamentos/{id} com o motivo no corpo', () => {
    service.remove('abc', 'lançado em duplicidade').subscribe();
    const req = http.expectOne('/api/Lancamentos/abc');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ motivo: 'lançado em duplicidade' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
