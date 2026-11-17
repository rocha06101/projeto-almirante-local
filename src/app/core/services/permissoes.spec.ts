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
    service.carregar().subscribe();
    const request = http.expectOne(url);
    service.limpar();
    expect(request.cancelled).toBe(true);
    expect(service.carregadas()).toBe(false);
  });
});
