import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
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
});
