import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FinancialEntriesComponent } from './financial-entries-component';

describe('FinancialEntriesComponent', () => {
  let component: FinancialEntriesComponent;
  let fixture: ComponentFixture<FinancialEntriesComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FinancialEntriesComponent] }).compileComponents();

    fixture = TestBed.createComponent(FinancialEntriesComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exibe a primeira página de lançamentos com rótulos por célula (usados no modo card do celular)', () => {
    const rows = host.querySelectorAll('tbody tr');
    expect(rows.length).toBe(component.pageSize());
    const labels = Array.from(rows[0].querySelectorAll('td[data-label]')).map(td => td.getAttribute('data-label'));
    expect(labels).toEqual(['Tipo', 'Categoria', 'Valor', 'Vencimento', 'Status', 'Ações']);
  });

  it('filtra pela pesquisa e volta para a primeira página', () => {
    component.goToPage(2);
    component.onSearchChange('mateus');
    expect(component.page()).toBe(1);
    expect(component.filteredLancamentos().every(item => item.nome.toLowerCase().includes('mateus'))).toBe(true);
  });

  it('modal abre com foco preso (cdkTrapFocus) e fecha', () => {
    component.openNewEntry();
    fixture.detectChanges();
    const dialog = host.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');

    component.closeModal();
    fixture.detectChanges();
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });
});
