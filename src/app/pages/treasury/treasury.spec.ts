import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { PermissoesService } from '../../core/services/permissoes';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';

import { routes } from '../../app.routes';
import { AuthService } from '../../core/services/auth';
import { TesourariaService } from '../../core/services/tesouraria';
import { Treasury } from './treasury';

describe('Treasury', () => {
  let component: Treasury;
  let fixture: ComponentFixture<Treasury>;
  const competencias = [
    { ano: 2026, mes: 1, entradas: 120, saidas: 80 },
    { ano: 2026, mes: 2, entradas: 150, saidas: 90 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Treasury],
      providers: [
        {
          provide: PermissoesService,
          useValue: { tem: (permissao: string) => permissao === 'financeiro.tesouraria.consultar' },
        },
        {
          provide: TesourariaService,
          useValue: { obterResumo: () => of({ receitasDespesas: competencias }) },
        },
      ],
    })
    .compileComponents();

    fixture = TestBed.createComponent(Treasury);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('updates chart labels and values from treasury competencies', () => {
    expect(component.barChartData.labels).toEqual(['Jan/2026', 'Fev/2026']);
    expect(component.barChartData.datasets[0].data).toEqual([120, 150]);
    expect(component.barChartData.datasets[1].data).toEqual([80, 90]);
  });
});

@Component({ template: '' })
class PerfilDeTeste {}

describe('Permissões da rota da tesouraria', () => {
  const rotaTesouraria = routes.find(route => route.path === '')!.children!
    .find(route => route.path === 'treasury')!;

  let harness: RouterTestingHarness;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([rotaTesouraria, { path: 'perfil', component: PerfilDeTeste }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isLoggedIn: () => true, validateSession: () => of(true) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  it.each([true, false])('aguarda as permissões antes de montar a tela (acesso financeiro: %s)', async autorizado => {
    const navegacao = harness.navigateByUrl('/treasury');
    const autorizacao = await vi.waitFor(() => http.expectOne('/api/Me/Permissoes'));
    expect(harness.routeNativeElement).toBeNull();
    http.expectNone(req => req.url === '/api/Lancamentos');

    autorizacao.flush({
      cargo: { id: 'c1', role: 'Membro', nome: 'Membro' },
      permissoes: autorizado ? ['financeiro.lancamentos.consultar'] : [],
      permissoesPorDesignacao: [],
      versaoAutorizacao: 1,
    });
    await navegacao;
    expect(TestBed.inject(Router).url).toBe(autorizado ? '/treasury' : '/perfil');

    if (autorizado) {
      http.expectOne(req => req.method === 'GET' && req.url === '/api/Lancamentos')
        .flush({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1 });
      harness.detectChanges();
      expect(harness.routeNativeElement?.textContent).toContain('Nenhum lançamento encontrado.');
      expect(harness.routeNativeElement?.textContent).not.toContain('Você não tem permissão');
    } else {
      http.expectNone(req => req.url === '/api/Lancamentos');
    }

    http.expectNone('/api/Me/Permissoes');
  });
});
