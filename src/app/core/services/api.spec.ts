import { TestBed } from '@angular/core/testing';
import { HttpContext, HttpContextToken, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ApiService } from './api';

describe('ApiService', () => {
  let service: ApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prefixa caminhos relativos com a base /api em localhost', () => {
    service.get('/Usuarios').subscribe();
    http.expectOne('/api/Usuarios').flush([]);
  });

  it('aceita caminhos sem barra inicial', () => {
    service.get('Usuarios').subscribe();
    http.expectOne('/api/Usuarios').flush([]);
  });

  it('não altera URLs absolutas', () => {
    service.get('https://example.org/x').subscribe();
    http.expectOne('https://example.org/x').flush({});
  });

  it('encaminha corpo, headers, parâmetros e contexto no PATCH', () => {
    const token = new HttpContextToken(() => false);
    const body = { telefone: '11987654321' };
    service.patch('/Usuarios/u1', body, {
      headers: { 'X-Test': 'patch' },
      params: { campo: 'telefone' },
      context: new HttpContext().set(token, true),
    }).subscribe();

    const req = http.expectOne({ method: 'PATCH', url: '/api/Usuarios/u1?campo=telefone' });
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('X-Test')).toBe('patch');
    expect(req.request.context.get(token)).toBe(true);
    req.flush({});
  });
});
