import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { FinancialEntriesComponent, TODOS_OS_MEMBROS, parseCurrencyInput } from './financial-entries-component';
import { Lancamento, LancamentosResponse } from '../../../features/lancamentos/models/lancamento.model';
import { LancamentosService } from '../../../features/lancamentos/services/lancamentos.service';
import { User as UsuarioService } from '../../../core/services/user';

const lancamento = (over: Partial<Lancamento> = {}): Lancamento => ({
  id: 'l1',
  membroId: 'm1',
  membroNome: 'Guilherme',
  finalidade: 'Mensalidade',
  descricao: null,
  categoria: 'Clube',
  tipoFluxo: 'Entrada',
  valor: 20,
  vencimento: '2026-08-10',
  status: 'Pendente',
  ...over,
});

/** Intl separa "R$" do número com espaço não quebrável. */
const plain = (text: string) => text.replace(/\s/g, ' ');

const page = (items: Lancamento[], total = items.length): LancamentosResponse => ({
  items,
  total,
  page: 1,
  pageSize: 10,
  totalPages: Math.max(1, Math.ceil(total / 10)),
});

describe('FinancialEntriesComponent', () => {
  let fixture: ComponentFixture<FinancialEntriesComponent>;
  let component: FinancialEntriesComponent;
  let host: HTMLElement;
  let service: { list: ReturnType<typeof vi.fn>; registrar: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };

  const create = async (response = page([lancamento(), lancamento({ id: 'l2', membroNome: 'Mateus', status: 'Pago' })])) => {
    service.list.mockReturnValue(of(response));
    fixture = TestBed.createComponent(FinancialEntriesComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = { list: vi.fn(), registrar: vi.fn(), update: vi.fn(), remove: vi.fn() };
    TestBed.configureTestingModule({
      imports: [FinancialEntriesComponent],
      providers: [
        { provide: LancamentosService, useValue: service },
        { provide: UsuarioService, useValue: { listarUsuarios: () => of([{ id: 'm1', nome: 'Guilherme', email: 'g@x', dataCriacao: '' }]) } },
      ],
    });
  });

  it('carrega a primeira página da API ao iniciar e mostra rótulos por célula (modo card do celular)', async () => {
    await create();

    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 10 }));
    const rows = host.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    const labels = Array.from(rows[0].querySelectorAll('td[data-label]')).map(td => td.getAttribute('data-label'));
    expect(labels).toEqual(['Finalidade', 'Categoria', 'Fluxo', 'Valor', 'Vencimento', 'Status', 'Ações']);
    expect(rows[0].textContent).toContain('10/08/2026');
  });

  it('filtra no servidor e volta para a página 1', async () => {
    await create();
    component.page.set(3);
    component.selectedStatus.set('Pago');
    component.onFilterChange();

    expect(service.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'Pago' }));
  });

  it('mostra mensagem de permissão quando a API responde 403', async () => {
    service.list.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })));
    fixture = TestBed.createComponent(FinancialEntriesComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.error-state')?.textContent).toContain('permissão');
  });

  it('registra lançamento individual com o contrato da API e recarrega a lista', async () => {
    await create();
    service.registrar.mockReturnValue(of(lancamento()));
    component.openNewEntry();
    component.lancamentoAtual = { ...component.lancamentoAtual, membroId: 'm1', finalidade: ' Campori ', valor: 200, vencimento: '2027-02-20', categoria: 'Evento', tipoFluxo: 'Saida' };

    component.submit();

    expect(service.registrar).toHaveBeenCalledWith(
      { membroId: 'm1', finalidade: 'Campori', descricao: null, categoria: 'Evento', tipoFluxo: 'Saida', valor: 200, vencimento: '2027-02-20' },
      undefined,
    );
    expect(component.modalMode()).toBeNull();
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('todos os membros: aplicarATodosOsMembros, sem membroId e com Idempotency-Key', async () => {
    await create();
    service.registrar.mockReturnValue(of({ operacaoId: 'o', usuariosProcessados: 2, lancamentosCriados: 2, dataHoraUtc: '' }));
    component.openNewEntry();
    component.lancamentoAtual = { ...component.lancamentoAtual, membroId: TODOS_OS_MEMBROS, valor: 30, vencimento: '2026-09-01' };

    component.submit();

    const [payload, key] = service.registrar.mock.calls[0];
    expect(payload.aplicarATodosOsMembros).toBe(true);
    expect('membroId' in payload).toBe(false);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('valida campos antes de chamar a API', async () => {
    await create();
    component.openNewEntry();
    component.submit();
    expect(component.formError()).toBe('Selecione o beneficiário.');
    expect(service.registrar).not.toHaveBeenCalled();
  });

  it('exclusão exige motivo e o envia à API', async () => {
    await create();
    service.remove.mockReturnValue(of(void 0));
    component.openDelete(lancamento());

    component.submit();
    expect(component.formError()).toBe('Informe o motivo da exclusão.');
    expect(service.remove).not.toHaveBeenCalled();

    component.motivoExclusao = ' duplicado ';
    component.submit();
    expect(service.remove).toHaveBeenCalledWith('l1', 'duplicado');
  });

  it('mostra o erro de validação retornado pela API (400)', async () => {
    await create();
    service.update.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 400, error: { errors: { Valor: ['Valor inválido.'] } } })));
    component.openEditEntry(lancamento());
    component.submit();
    expect(component.formError()).toBe('Valor inválido.');
    expect(component.saving()).toBe(false);
  });

  it('máscara do Valor: número ↔ texto pt-BR', async () => {
    await create();

    expect(plain(component.formatCurrencyInput(100))).toBe('R$ 100,00');
    expect(plain(component.formatCurrencyInput(1000))).toBe('R$ 1.000,00');
    expect(plain(component.formatCurrencyInput(1250.5))).toBe('R$ 1.250,50');
    expect(component.formatCurrencyInput(null)).toBe('');

    expect(parseCurrencyInput('R$ 100,00')).toBe(100);
    expect(parseCurrencyInput('R$ 1.000,00')).toBe(1000);
    expect(parseCurrencyInput('R$ 1.250,50')).toBe(1250.5);
    expect(parseCurrencyInput('R$ 0,00')).toBeNull();
    expect(parseCurrencyInput('')).toBeNull();
  });

  it('mascara o Valor durante a digitação e envia número ao registrar', async () => {
    await create();
    service.registrar.mockReturnValue(of(lancamento()));
    component.openNewEntry();
    fixture.detectChanges();
    const input = host.querySelector<HTMLInputElement>('input[name="valor"]')!;
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      return plain(input.value);
    };

    expect(type('1')).toBe('R$ 0,01');
    expect(type('10')).toBe('R$ 0,10');
    expect(type('100')).toBe('R$ 1,00');
    expect(type('10000')).toBe('R$ 100,00');
    expect(type('R$ 100,005')).toBe('R$ 1.000,05'); // próximo dígito digitado no fim do campo mascarado
    expect(type('125050')).toBe('R$ 1.250,50');

    component.lancamentoAtual = { ...component.lancamentoAtual, membroId: 'm1', vencimento: '2027-02-20' };
    component.submit();

    expect(service.registrar.mock.calls[0][0].valor).toBe(1250.5);
  });

  it('edição mostra o valor mascarado e reenvia o mesmo número', async () => {
    await create();
    service.update.mockReturnValue(of(lancamento()));
    component.openEditEntry(lancamento({ valor: 1250.5 }));
    fixture.detectChanges();

    expect(plain(host.querySelector<HTMLInputElement>('input[name="valor"]')!.value)).toBe('R$ 1.250,50');

    component.submit();
    expect(service.update).toHaveBeenCalledWith('l1', expect.objectContaining({ valor: 1250.5 }));
  });

  it('lançamentos de evento não podem ser editados/excluídos aqui', async () => {
    await create(page([lancamento({ eventoId: 'ev1' })]));
    const buttons = host.querySelectorAll<HTMLButtonElement>('tbody .icon-button');
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[2].disabled).toBe(true);
  });
});
