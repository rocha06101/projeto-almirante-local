import { PermissoesService } from '../../../core/services/permissoes';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';

import { FinancialEntriesComponent, TODOS_OS_MEMBROS, parseCurrencyInput } from './financial-entries-component';
import { Lancamento, LancamentosResponse } from '../../../features/lancamentos/models/lancamento.model';
import { LancamentosService } from '../../../features/lancamentos/services/lancamentos.service';
import { ToastService } from '../../../core/services/toast.service';
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

const pagamentoOriginal = lancamento({
  id: 'original', categoria: 'Evento', eventoId: 'ev1', valor: 300, valorPago: 300,
  status: 'Pago', dataPagamento: '2026-11-10',
});
const devolucao = lancamento({
  id: 'devolucao', categoria: 'Evento', tipoFluxo: 'Saida', valor: 252, eventoId: 'ev1',
  lancamentoOrigemId: pagamentoOriginal.id, descricao: 'Devolução - Evento - Passeio - 30/11/2026',
});
const devolucaoPaga: Lancamento = {
  ...devolucao, status: 'Pago', valorPago: 200, dataPagamento: '2026-11-18',
  devolucaoJustificativa: 'Valor acordado',
};

describe('FinancialEntriesComponent', () => {
  let fixture: ComponentFixture<FinancialEntriesComponent>;
  let component: FinancialEntriesComponent;
  let host: HTMLElement;
  let service: Record<'list' | 'registrar' | 'update' | 'remove' | 'getById' | 'registrarDevolucao' | 'corrigirDevolucao', ReturnType<typeof vi.fn>>;
  let permissoes: { tem: ReturnType<typeof vi.fn> };
  let toast: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

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
    service = {
      list: vi.fn(), registrar: vi.fn(), update: vi.fn(), remove: vi.fn(),
      getById: vi.fn(), registrarDevolucao: vi.fn(), corrigirDevolucao: vi.fn(),
    };
    permissoes = { tem: vi.fn(() => true) };
    toast = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      imports: [FinancialEntriesComponent],
      providers: [
        { provide: PermissoesService, useValue: permissoes },
        { provide: ToastService, useValue: toast },
        { provide: LancamentosService, useValue: service },
        { provide: UsuarioService, useValue: { listarMembros: () => of([{ id: 'm1', nome: 'Guilherme', email: 'g@x', dataCriacao: '' }]) } },
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

  it('abre um único modal com Lançamento Único e mostra o formulário individual por padrão', async () => {
    await create();
    host.querySelector<HTMLButtonElement>('.toolbar .primary-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const selector = host.querySelector<HTMLSelectElement>('select[name="modalLancamentoTipo"]');
    expect(selector?.value).toBe('unico');
    expect(Array.from(selector!.options).map(option => option.textContent?.trim())).toEqual([
      'Lançamento Único',
      'Lançamento Geral',
    ]);
    expect(host.querySelectorAll('.modal-backdrop')).toHaveLength(1);
    expect(host.querySelector('select[name="membroId"]')).not.toBeNull();
    expect(host.querySelector('.readonly-field strong')?.textContent).not.toBe('Todos os membros');
    expect(component.modalLancamentoTipo()).toBe('unico');
  });

  it('alterna os formulários geral e individual dentro do mesmo modal', async () => {
    await create();
    component.openNewEntry();
    fixture.detectChanges();
    const selector = host.querySelector<HTMLSelectElement>('select[name="modalLancamentoTipo"]')!;

    selector.value = 'geral';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.modalLancamentoTipo()).toBe('geral');
    expect(component.lancamentoAtual.membroId).toBe(TODOS_OS_MEMBROS);
    expect(host.querySelector('select[name="membroId"]')).toBeNull();
    expect(host.querySelector('.readonly-field strong')?.textContent).toBe('Todos os membros');
    expect(host.querySelector('.modal-actions .primary-button')?.textContent).toContain('Salvar lançamento geral');

    selector.value = 'unico';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(component.modalLancamentoTipo()).toBe('unico');
    expect(component.lancamentoAtual.membroId).toBe('');
    expect(host.querySelector('select[name="membroId"]')).not.toBeNull();
  });

  it('reabre sempre em Lançamento Único depois de fechar uma criação geral', async () => {
    await create();
    const openButton = host.querySelector<HTMLButtonElement>('.toolbar .primary-button')!;
    openButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const selector = host.querySelector<HTMLSelectElement>('select[name="modalLancamentoTipo"]')!;
    selector.value = 'geral';
    selector.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('.close-button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    host.querySelector<HTMLButtonElement>('.toolbar .primary-button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.modalLancamentoTipo()).toBe('unico');
    expect(component.lancamentoAtual.membroId).toBe('');
    expect(host.querySelector<HTMLSelectElement>('select[name="modalLancamentoTipo"]')?.value).toBe('unico');
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
    component.onModalLancamentoTipoChange('geral');
    component.lancamentoAtual = { ...component.lancamentoAtual, valor: 30, vencimento: '2026-09-01' };

    component.submit();

    const [payload, key] = service.registrar.mock.calls[0];
    expect(payload.aplicarATodosOsMembros).toBe(true);
    expect('membroId' in payload).toBe(false);
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(component.modalMode()).toBeNull();
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('reutiliza a mesma Idempotency-Key ao repetir um lançamento geral após erro', async () => {
    await create();
    service.registrar
      .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })))
      .mockReturnValueOnce(of({ operacaoId: 'o', usuariosProcessados: 2, lancamentosCriados: 2, dataHoraUtc: '' }));
    component.openNewEntry();
    component.onModalLancamentoTipoChange('geral');
    component.lancamentoAtual = { ...component.lancamentoAtual, valor: 30, vencimento: '2026-09-01' };

    component.submit();
    const firstKey = service.registrar.mock.calls[0][1];
    expect(component.saving()).toBe(false);
    component.submit();

    expect(service.registrar).toHaveBeenCalledTimes(2);
    expect(service.registrar.mock.calls[1][1]).toBe(firstKey);
  });

  it('ignora submits repetidos enquanto o registro está pendente', async () => {
    await create();
    const pending = new Subject<Lancamento>();
    service.registrar.mockReturnValue(pending);
    component.openNewEntry();
    component.onModalLancamentoTipoChange('geral');
    component.lancamentoAtual = { ...component.lancamentoAtual, valor: 30, vencimento: '2026-09-01' };

    component.submit();
    component.submit();

    expect(service.registrar).toHaveBeenCalledTimes(1);
    expect(component.saving()).toBe(true);
    pending.next(lancamento());
    pending.complete();
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

    expect(component.modalLancamentoTipo()).toBe('unico');
    expect(host.querySelector('select[name="modalLancamentoTipo"]')).toBeNull();
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
  it('devolução permanece Saída e exibe baixa real, sem permitir edição/exclusão avulsa', async () => {
    const item = lancamento({ eventoId: 'ev1', lancamentoOrigemId: 'original', tipoFluxo: 'Saida',
      valor: 20, valorPago: 15, dataPagamento: '2026-11-18', status: 'Pago', devolucaoJustificativa: 'Valor acordado' });
    await create(page([item]));
    component.openEditEntry(item); expect(component.modalMode()).toBeNull();
    component.openDelete(item); expect(component.modalMode()).toBeNull();
    expect(service.update).not.toHaveBeenCalled(); expect(service.remove).not.toHaveBeenCalled();
    component.viewEntry(item); fixture.detectChanges();
    expect(host.textContent).toContain('Saída'); expect(host.textContent).toContain('Valor devolvido');
    expect(host.textContent).toContain('Valor acordado'); expect(host.textContent).toContain('18/11/2026');
  });

  describe('baixa e correção de devoluções', () => {
    beforeEach(() => {
      // Em São Paulo ainda é 18/11, embora em UTC já seja 19/11.
      vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-19T02:59:59Z'));
    });
    afterEach(() => vi.restoreAllMocks());

    const abrirPendente = () => component.openDevolucao(devolucao, 'registrarDevolucao');
    const revisarIntegral = () => {
      component.dataDevolucao = '2026-11-18';
      component.revisarDevolucao();
    };

    it('identifica pela origem e mostra membro, evento, fluxo, valores, data e estado', async () => {
      await create(page([
        devolucao,
        { ...devolucaoPaga, id: 'paga' },
        { ...devolucao, id: 'atrasada', status: 'Atrasado' },
        lancamento({ id: 'comum', tipoFluxo: 'Saida', descricao: devolucao.descricao }),
      ]));
      const [pendente, paga, atrasada, comum] = host.querySelectorAll('tbody tr');
      expect(plain(pendente.textContent)).toContain('R$ 252,00');
      expect(pendente.textContent).toContain('Guilherme');
      expect(pendente.textContent).toContain('Passeio');
      expect(pendente.textContent).toContain('Pagamento de origem original');
      expect(pendente.textContent).toContain('Saída');
      expect(pendente.textContent).toContain('Pendente');
      expect(pendente.textContent).toContain('Registrar devolução');
      expect(plain(paga.textContent)).toContain('Devolvido R$ 200,00');
      expect(paga.textContent).toContain('18/11/2026');
      expect(paga.textContent).toContain('Pago');
      expect(paga.textContent).toContain('Corrigir devolução');
      expect(paga.textContent).not.toContain('Registrar devolução');
      expect(atrasada.textContent).toContain('Atrasado');
      expect(atrasada.querySelector('.refund-action')).toBeNull();
      expect(comum.querySelector('.refund-action')).toBeNull();
      expect(comum.querySelector('.refund-summary')).toBeNull();
      expect(pendente.querySelectorAll('.icon-button')).toHaveLength(1);
      component.openDevolucao(devolucaoPaga, 'registrarDevolucao');
      expect(component.modalMode()).toBeNull();
    });

    it('exige permissão de consulta antes de buscar lançamentos', async () => {
      permissoes.tem.mockReturnValue(false);
      await create(page([devolucao]));
      expect(service.list).not.toHaveBeenCalled();
      expect(host.querySelector('tbody tr')).toBeNull();
    });

    it.each([
      [null, 'Evento vinculado'],
      ['  ', 'Evento vinculado'],
      ['Devolução - Evento - Título alterado - 30/11/2026', 'Devolução - Evento - Título alterado - 30/11/2026'],
      ['Estorno referente à visita ao museu', 'Estorno referente à visita ao museu'],
    ])('apresenta a descrição %j sem usar o UUID como nome de evento', async (descricao, exibicao) => {
      const eventoId = '11111111-1111-1111-1111-111111111111';
      const item = { ...devolucao, eventoId, descricao };
      await create(page([item]));

      const resumo = host.querySelector('tbody .refund-summary')!;
      expect(resumo.textContent).toContain(exibicao);
      expect(resumo.textContent).not.toContain(eventoId);
      component.openDevolucao(item, 'registrarDevolucao');
      fixture.detectChanges();
      const dialog = host.querySelector('[role="dialog"]')!;
      expect(dialog.textContent).toContain('Evento de origem');
      expect(dialog.textContent).toContain(exibicao);
      expect(dialog.textContent).not.toContain(eventoId);

      component.closeModal();
      component.viewEntry(item);
      fixture.detectChanges();
      const idField = Array.from(host.querySelectorAll('dt')).find(dt => dt.textContent === 'ID do evento');
      expect(idField?.nextElementSibling?.textContent).toBe(eventoId);
      expect(service.list).toHaveBeenCalledTimes(1);
      expect(service.getById).not.toHaveBeenCalled();
    });

    it('exibe uma descrição sem eventoId sem inferir vínculo pelo texto', async () => {
      const item = { ...devolucao, eventoId: null, descricao: 'Devolução - Evento - Passeio' };
      await create(page([item]));
      component.openDevolucao(item, 'registrarDevolucao');
      fixture.detectChanges();
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain('DescriçãoDevolução - Evento - Passeio');
      expect(host.querySelector('[role="dialog"]')?.textContent).not.toContain('Evento de origem');
    });

    it('exige a permissão de registrar pagamentos para abrir e novamente para confirmar', async () => {
      permissoes.tem.mockImplementation((chave: string) => chave !== 'financeiro.pagamentos.registrar');
      await create(page([devolucao]));
      expect(host.querySelector('.refund-action')).toBeNull();
      abrirPendente();
      expect(component.modalMode()).toBeNull();

      permissoes.tem.mockReturnValue(true);
      abrirPendente();
      revisarIntegral();
      permissoes.tem.mockImplementation((chave: string) => chave !== 'financeiro.pagamentos.registrar');
      component.confirmarDevolucao();
      expect(service.registrarDevolucao).not.toHaveBeenCalled();
      expect(component.formError()).toContain('permissões');
    });

    it('revisa a baixa integral sem justificativa e envia uma vez mesmo com confirmação repetida', async () => {
      const response = new Subject<Lancamento>();
      const persistido: Lancamento = { ...devolucaoPaga, valorPago: 252, devolucaoJustificativa: null };
      await create(page([devolucao, pagamentoOriginal]));
      service.registrarDevolucao.mockReturnValue(response);
      service.list.mockReturnValue(of(page([persistido, pagamentoOriginal])));

      host.querySelector<HTMLButtonElement>('.refund-action')!.click();
      fixture.detectChanges();
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Passeio');
      component.dataDevolucao = '2026-11-18';
      host.querySelector<HTMLButtonElement>('button[form="form-devolucao"]')!.click();
      fixture.detectChanges();
      expect(service.registrarDevolucao).not.toHaveBeenCalled();
      expect(host.querySelector('[role="dialog"]')?.textContent).toContain('Confirme o registro');
      const confirmacao = host.querySelector<HTMLButtonElement>('.modal-actions .primary-button')!;
      confirmacao.click();
      confirmacao.click();
      fixture.detectChanges();
      expect(confirmacao.disabled).toBe(true);
      component.closeModal();

      expect(service.registrarDevolucao).toHaveBeenCalledExactlyOnceWith(devolucao.id, {
        valorPago: 252, dataPagamento: '2026-11-18', justificativa: null,
      });
      expect(component.saving()).toBe(true);
      expect(component.items()).toEqual([devolucao, pagamentoOriginal]);
      expect(toast.success).not.toHaveBeenCalled();

      response.next(persistido);
      response.complete();
      fixture.detectChanges();
      expect(service.list).toHaveBeenCalledTimes(2);
      expect(component.items()).toEqual([persistido, pagamentoOriginal]);
      expect(service.update).not.toHaveBeenCalled();
      expect(service.remove).not.toHaveBeenCalled();
      expect(component.modalMode()).toBeNull();
      expect(toast.success).toHaveBeenCalledExactlyOnceWith('Devolução registrada com sucesso.');
    });

    it('exige justificativa para valor menor e valida tamanho, espaços e Windows-1252', async () => {
      await create(page([devolucao]));
      abrirPendente();
      component.valorDevolucaoTexto = component.formatCurrency(200);
      revisarIntegral();
      expect(component.errosDevolucao().justificativa).toContain('Informe');

      for (const texto of ['a b', '   ', 'a'.repeat(256), 'abc😀', 'a\tbcd']) {
        component.justificativaDevolucao = texto;
        component.revisarDevolucao();
        expect(component.errosDevolucao().justificativa).toBeTruthy();
        component.confirmarDevolucao();
      }
      expect(service.registrarDevolucao).not.toHaveBeenCalled();
      component.justificativaDevolucao = '  Ajuste de transferência – €  ';
      component.revisarDevolucao();
      expect(component.revisaoDevolucao()).toEqual({
        dataPagamento: '2026-11-18', valorPago: 200, justificativa: 'Ajuste de transferência – €',
      });
      service.registrarDevolucao.mockReturnValue(of(devolucaoPaga));
      service.list.mockReturnValue(of(page([devolucaoPaga])));
      component.confirmarDevolucao();
      expect(service.registrarDevolucao).toHaveBeenCalledExactlyOnceWith(devolucao.id, {
        dataPagamento: '2026-11-18', valorPago: 200, justificativa: 'Ajuste de transferência – €',
      });
    });

    it('limita a justificativa no campo, exibe o contador e associa o erro ao input', async () => {
      await create(page([devolucao]));
      abrirPendente();
      fixture.detectChanges();
      await fixture.whenStable();
      const input = host.querySelector<HTMLInputElement>('#justificativa-devolucao')!;
      expect(input.maxLength).toBe(255);
      input.value = 'a b';
      input.dispatchEvent(new Event('input'));
      revisarIntegral();
      fixture.detectChanges();
      expect(host.querySelector('#ajuda-justificativa')?.textContent).toContain('3/255 caracteres');
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')?.split(' ')).toContain('erro-justificativa');
      expect(host.querySelector('#erro-justificativa')?.getAttribute('role')).toBe('alert');
    });

    it.each(['', 'R$ 0,00', '-252,00', 'R$ 252,01', 'R$ 0,001', '2a0'])(
      'rejeita valor ausente ou inválido (%j) e exige data', async (texto) => {
        await create(page([devolucao]));
        abrirPendente();
        fixture.detectChanges();
        const input = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
        input.value = texto;
        input.dispatchEvent(new Event('input'));
        component.revisarDevolucao();
        component.confirmarDevolucao();
        expect(component.errosDevolucao().valorPago).toBeTruthy();
        expect(component.errosDevolucao().dataPagamento).toContain('Informe');
        expect(service.registrarDevolucao).not.toHaveBeenCalled();
      },
    );

    it('digita centavos e aceita colagem pt-BR sem converter sinais ou caracteres inválidos', async () => {
      await create(page([devolucao]));
      abrirPendente();
      fixture.detectChanges();
      const input = host.querySelector<HTMLInputElement>('input[inputmode="numeric"]')!;
      input.value = '2';
      input.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
      expect(plain(input.value)).toBe('R$ 0,02');
      input.value += '5';
      input.dispatchEvent(new InputEvent('input', { inputType: 'insertText' }));
      expect(plain(input.value)).toBe('R$ 0,25');
      input.value = '252,0';
      input.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste' }));
      expect(plain(input.value)).toBe('R$ 252,00');
      revisarIntegral();
      expect(component.revisaoDevolucao()?.valorPago).toBe(252);
    });

    it.each(['2026-02-30', '2026-2-03', '18/11/2026'])('rejeita a data civil inválida %j antes de enviar', async data => {
      await create(page([devolucao]));
      abrirPendente();
      component.dataDevolucao = data;
      component.revisarDevolucao();
      expect(component.errosDevolucao().dataPagamento).toBe('Informe uma data válida.');
      expect(component.revisaoDevolucao()).toBeNull();
    });

    it.each([
      ['registrarDevolucao', devolucao],
      ['corrigirDevolucao', devolucaoPaga],
    ] as const)('valida a data civil do clube ao executar %s', async (mode, item) => {
      await create(page([item]));
      component.openDevolucao(item, mode);
      component.dataDevolucao = '2026-11-19';
      component.revisarDevolucao();
      component.confirmarDevolucao();
      fixture.detectChanges();
      expect(host.querySelector<HTMLInputElement>('#data-devolucao')?.max).toBe('2026-11-18');
      expect(host.querySelector('#erro-data-devolucao')?.textContent).toContain('não pode ser futura');
      expect(component.revisaoDevolucao()).toBeNull();
      expect(service.registrarDevolucao).not.toHaveBeenCalled();
      expect(service.corrigirDevolucao).not.toHaveBeenCalled();

      component.dataDevolucao = '2024-02-29';
      component.revisarDevolucao();
      expect(component.revisaoDevolucao()?.dataPagamento).toBe('2024-02-29');
      component.voltarDevolucao();
      component.dataDevolucao = '2026-11-18';
      component.revisarDevolucao();
      expect(component.revisaoDevolucao()?.dataPagamento).toBe('2026-11-18');
      component.voltarDevolucao();

      vi.mocked(Date.now).mockReturnValue(Date.parse('2026-11-19T03:00:00Z'));
      component.dataDevolucao = '2026-11-19';
      component.revisarDevolucao();
      expect(component.revisaoDevolucao()?.dataPagamento).toBe('2026-11-19');
    });

    it.each([
      [400, { errors: { dataPagamento: ['dataPagamento não pode ser uma data futura.'] } }, 'data futura'],
      [401, {}, 'sessão expirou'],
      [403, {}, 'não tem permissão'],
      [404, {}, 'não encontrado'],
    ])('preserva os dados e apresenta o erro HTTP %s', async (status, error, mensagem) => {
      await create(page([devolucao]));
      service.registrarDevolucao.mockReturnValue(throwError(() => new HttpErrorResponse({ status, error })));
      abrirPendente();
      component.justificativaDevolucao = 'Valor integral';
      revisarIntegral();
      component.confirmarDevolucao();
      expect(component.modalMode()).toBe('registrarDevolucao');
      expect(component.formError()).toContain(mensagem);
      expect(component.dataDevolucao).toBe('2026-11-18');
      expect(component.justificativaDevolucao).toBe('Valor integral');
      expect(component.saving()).toBe(false);
      expect(component.items()).toEqual([devolucao]);
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledTimes(status === 401 ? 0 : 1);
      if (status === 400) expect(component.errosDevolucao().dataPagamento).toContain(mensagem);
    });

    it('reconsulta após falha de rede e só libera nova tentativa após verificar que segue pendente', async () => {
      await create(page([devolucao]));
      service.registrarDevolucao.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 0 })));
      const consulta = new Subject<Lancamento>();
      service.getById.mockReturnValueOnce(consulta).mockReturnValueOnce(of(devolucao));
      abrirPendente();
      revisarIntegral();
      component.confirmarDevolucao();
      revisarIntegral();
      component.confirmarDevolucao();
      expect(service.getById).toHaveBeenCalledExactlyOnceWith(devolucao.id);
      expect(service.registrarDevolucao).toHaveBeenCalledTimes(1);
      expect(component.consultandoDevolucao()).toBe(true);
      expect(toast.error).toHaveBeenCalledWith('Sem conexão com o servidor.');

      consulta.error(new HttpErrorResponse({ status: 0 }));
      revisarIntegral();
      expect(component.revisaoDevolucao()).toBeNull();
      component.closeModal();
      abrirPendente();
      expect(service.getById).toHaveBeenCalledTimes(2);
      revisarIntegral();
      expect(component.revisaoDevolucao()?.valorPago).toBe(252);
    });

    it.each([0, 409, 502])('reconcilia HTTP %s quando a API já mostra baixa e bloqueia reenvio', async status => {
      await create(page([devolucao, pagamentoOriginal]));
      service.registrarDevolucao.mockReturnValue(throwError(() => new HttpErrorResponse({
        status, error: { detail: 'Esta devolução já tem baixa registrada.' },
      })));
      service.getById.mockReturnValue(of(devolucaoPaga));
      service.list.mockReturnValue(of(page([devolucaoPaga, pagamentoOriginal])));
      abrirPendente();
      revisarIntegral();
      component.confirmarDevolucao();
      revisarIntegral();
      component.confirmarDevolucao();
      expect(service.registrarDevolucao).toHaveBeenCalledTimes(1);
      expect(component.devolucaoDesatualizada()).toBe(true);
      expect(component.formError()).toContain('concluída');
      expect(component.items()).toEqual([devolucaoPaga, pagamentoOriginal]);
      expect(toast.success).not.toHaveBeenCalled();
    });

    it('preenche dados persistidos na correção e usa somente a mutação dedicada da devolução', async () => {
      await create(page([devolucaoPaga, pagamentoOriginal]));
      const corrigida = { ...devolucaoPaga, valorPago: 252, devolucaoJustificativa: null };
      const response = new Subject<Lancamento>();
      service.corrigirDevolucao.mockReturnValue(response);
      service.list.mockReturnValue(of(page([corrigida, pagamentoOriginal])));
      component.openDevolucao(devolucaoPaga, 'corrigirDevolucao');
      expect(plain(component.valorDevolucaoTexto)).toBe('R$ 200,00');
      expect(component.dataDevolucao).toBe('2026-11-18');
      expect(component.justificativaDevolucao).toBe('Valor acordado');
      component.valorDevolucaoTexto = component.formatCurrency(252);
      component.justificativaDevolucao = '';
      component.revisarDevolucao();
      fixture.detectChanges();
      const confirmar = host.querySelector<HTMLButtonElement>('.modal-actions .primary-button')!;
      confirmar.click();
      confirmar.click();
      fixture.detectChanges();
      expect(confirmar.disabled).toBe(true);
      expect(service.corrigirDevolucao).toHaveBeenCalledExactlyOnceWith(devolucao.id, {
        dataPagamento: '2026-11-18', valorPago: 252, justificativa: null,
      });
      expect(service.registrarDevolucao).not.toHaveBeenCalled();
      expect(service.update).not.toHaveBeenCalled();
      expect(component.items()).toEqual([devolucaoPaga, pagamentoOriginal]);
      response.next(corrigida);
      response.complete();
      expect(component.items()).toEqual([corrigida, pagamentoOriginal]);
      expect(toast.success).toHaveBeenCalledWith('Devolução corrigida com sucesso.');
    });
  });
});
