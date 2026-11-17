import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PermissoesService } from './permissoes';

describe('PermissoesService', () => {
  let service: PermissoesService;
  let http: HttpTestingController;
  const url = '/api/Me/Permissoes';

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PermissoesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('compartilha a consulta e substitui as permissões efetivas na nova revisão', () => {
    service.carregar().subscribe();
    service.carregar().subscribe();
    http.expectOne(url).flush({
      permissoes: ['eventos.consultar', 'almoxarifado.consultar'],
      permissoesPorDesignacao: ['almoxarifado.consultar'],
      versaoAutorizacao: 1,
    });
    expect(service.tem('almoxarifado.consultar')).toBe(true);
    service.carregar().subscribe();
    http.expectOne(url).flush({ permissoes: [], versaoAutorizacao: 2 });
    expect(service.tem('eventos.consultar')).toBe(false);
    expect(service.versaoAutorizacao()).toBe(2);
  });

  it('cancela a consulta pendente ao encerrar a sessão', () => {
    const resultado = vi.fn();
    service.atualizar().subscribe(resultado);
    const request = http.expectOne(url);
    service.limpar();
    expect(resultado).toHaveBeenCalledWith({ tipo: 'cancelado' });
    expect(request.cancelled).toBe(true);
    expect(service.carregadas()).toBe(false);
  });
  it('remove concessões antigas quando a atualização falha', () => {
    service.carregar().subscribe();
    http.expectOne(url).flush({ permissoes: ['autorizacao.consultar'], versaoAutorizacao: 1 });
    const resultado = vi.fn();
    service.atualizar().subscribe(resultado);
    http.expectOne(url).flush({}, { status: 403, statusText: 'Forbidden' });
    expect(resultado).toHaveBeenCalledWith({
      tipo: 'falha',
      erro: expect.objectContaining({ status: 403 }),
    });
    expect(service.tem('autorizacao.consultar')).toBe(false);
    expect(service.carregadas()).toBe(false);
  });
  it('valida uma lista vazia de permissões', () => {
    const resultado = vi.fn();
    const resposta = { permissoes: [], versaoAutorizacao: 2 };
    service.atualizar().subscribe(resultado);
    http.expectOne(url).flush(resposta);
    expect(resultado).toHaveBeenCalledWith({ tipo: 'validado', permissoes: resposta });
    expect(service.carregadas()).toBe(true);
    expect(service.tem('autorizacao.consultar')).toBe(false);
  });
});
