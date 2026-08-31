import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';

import { LancamentosService } from './lancamentos.service';
import { ApiService } from '../../../core/services/api';

describe('LancamentosService', () => {
  let service: LancamentosService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [LancamentosService, ApiService],
    });

    service = TestBed.inject(LancamentosService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should request paginated launch entries from the API', () => {
    service.list({ page: 2, pageSize: 10, search: 'campori' }).subscribe(response => {
      expect(response.items.length).toBe(1);
      expect(response.page).toBe(2);
    });

    const req = httpMock.expectOne(req => req.method === 'GET' && req.url.includes('/Lancamentos'));
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('search')).toBe('campori');

    req.flush({
      items: [
        {
          id: '1',
          membroNome: 'Guilherme',
          tipo: 'Campori',
          descricao: 'Campori regional',
          categoria: 'Evento',
          valor: 200,
          vencimento: '2027-02-20',
          status: 'Pago',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 10,
      totalPages: 1,
    });
  });
});
