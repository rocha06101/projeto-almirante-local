import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { FinancialEntriesComponent } from './financial-entries-component';
import { LancamentosService } from '../../../features/lancamentos/services/lancamentos.service';

describe('FinancialEntriesComponent', () => {
  let component: FinancialEntriesComponent;
  let fixture: ComponentFixture<FinancialEntriesComponent>;
  let lancamentosService: jasmine.SpyObj<LancamentosService>;

  beforeEach(async () => {
    lancamentosService = jasmine.createSpyObj<LancamentosService>('LancamentosService', ['list', 'remove']);
    lancamentosService.list.and.returnValue(
      of({
        items: [
          {
            id: 'l1',
            membroId: '1',
            membroNome: 'Guilherme',
            tipo: 'Mensalidade',
            descricao: 'Mensalidade',
            categoria: 'Clube',
            valor: 200,
            moeda: 'BRL',
            vencimento: '2026-08-10',
            status: 'Pago',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      }),
    );

    await TestBed.configureTestingModule({
      imports: [FinancialEntriesComponent],
      providers: [{ provide: LancamentosService, useValue: lancamentosService }],
    }).compileComponents();

    fixture = TestBed.createComponent(FinancialEntriesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load financial entries on init', () => {
    expect(lancamentosService.list).toHaveBeenCalled();
    expect(component.lancamentos().length).toBe(1);
    expect(component.lancamentos()[0].membroNome).toBe('Guilherme');
  });
});
