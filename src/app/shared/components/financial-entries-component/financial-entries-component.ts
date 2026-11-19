import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, OnDestroy, OnInit, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

import { StatusBadgeComponent } from '../../../features/lancamentos/components/status-badge/status-badge';
import {
  DevolucaoLancamentoInput,
  Lancamento,
  LancamentoCategoria,
  LancamentoStatus,
  LancamentoTipoFluxo,
  RegistrarLancamentoInput,
} from '../../../features/lancamentos/models/lancamento.model';
import { LancamentosService } from '../../../features/lancamentos/services/lancamentos.service';
import { MembroResumo } from '../../../core/models/user.model';
import { PermissoesService } from '../../../core/services/permissoes';
import { ToastService } from '../../../core/services/toast.service';
import { User as UsuarioService } from '../../../core/services/user';
import { cabeEmWindows1252 } from '../../validators/texto-varchar';

type ModalDevolucaoMode = 'registrarDevolucao' | 'corrigirDevolucao';
type ModalMode = 'new' | 'edit' | 'view' | 'delete' | ModalDevolucaoMode;
type ModalLancamentoTipo = 'unico' | 'geral';
type ErrosDevolucao = Partial<Record<keyof DevolucaoLancamentoInput, string>>;

interface LancamentoForm {
  /** '' = nenhum; TODOS_OS_MEMBROS = lançamento em lote. */
  membroId: string;
  finalidade: string;
  descricao: string;
  categoria: LancamentoCategoria;
  tipoFluxo: LancamentoTipoFluxo;
  valor: number | null;
  vencimento: string;
  status: LancamentoStatus;
}

export const TODOS_OS_MEMBROS = '__todos__';
const SEARCH_DEBOUNCE_MS = 300;
const CONSULTAR_LANCAMENTOS = 'financeiro.lancamentos.consultar';
const REGISTRAR_PAGAMENTOS = 'financeiro.pagamentos.registrar';

/**
 * Máscara de centavos do campo Valor: só os dígitos contam ("R$ 1.250,50" → 1250.5).
 * Vazio ou zero → null, para o campo poder ser apagado. 15 dígitos cabem em inteiro seguro.
 */
export function parseCurrencyInput(text: string): number | null {
  const cents = Number(text.replace(/\D/g, '').slice(0, 15));
  return cents > 0 ? cents / 100 : null;
}

@Component({
  selector: 'app-financial-entries-component',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule, StatusBadgeComponent],
  templateUrl: './financial-entries-component.html',
  styleUrl: './financial-entries-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialEntriesComponent implements OnInit, OnDestroy {
  private readonly lancamentosService = inject(LancamentosService);
  readonly permissoes = inject(PermissoesService);
  private readonly usuarioService = inject(UsuarioService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly listHeading = viewChild<ElementRef<HTMLElement>>('listHeading');
  private readonly devolucaoFocus = viewChild<ElementRef<HTMLElement>>('devolucaoFocus');

  private searchTimer?: ReturnType<typeof setTimeout>;
  private listRequest?: Subscription;
  private idempotencyKey = '';
  private readonly devolucoesAConsultar = new Set<string>();

  readonly TODOS = TODOS_OS_MEMBROS;
  /** A API recusa vencimento no passado ao registrar (yyyy-MM-dd, data local). */
  readonly today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

  // Lista (paginada e filtrada no servidor)
  readonly items = signal<Lancamento[]>([]);
  readonly total = signal(0);
  readonly totalPages = signal(1);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly loading = signal(false);
  readonly listError = signal('');

  // Filtros
  readonly search = signal('');
  readonly selectedStatus = signal<'Todos' | LancamentoStatus>('Todos');
  readonly selectedFinalidade = signal('Todos');
  readonly selectedDate = signal('');

  // Modal
  readonly modalMode = signal<ModalMode | null>(null);
  readonly modalLancamentoTipo = signal<ModalLancamentoTipo>('unico');
  readonly selected = signal<Lancamento | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly usuarios = signal<MembroResumo[]>([]);
  readonly usuariosError = signal('');
  motivoExclusao = '';
  lancamentoAtual: LancamentoForm = this.emptyForm();
  valorDevolucaoTexto = '';
  dataDevolucao = '';
  justificativaDevolucao = '';
  readonly errosDevolucao = signal<ErrosDevolucao>({});
  readonly revisaoDevolucao = signal<DevolucaoLancamentoInput | null>(null);
  readonly consultandoDevolucao = signal(false);
  readonly precisaConsultarDevolucao = signal(false);
  readonly devolucaoDesatualizada = signal(false);

  readonly modalDevolucao = computed(() => {
    const mode = this.modalMode();
    return mode === 'registrarDevolucao' || mode === 'corrigirDevolucao' ? mode : null;
  });
  readonly modalDevolucaoOcupado = computed(
    () => !!this.modalDevolucao() && (this.saving() || this.consultandoDevolucao()),
  );

  readonly statusOptions: Array<'Todos' | LancamentoStatus> = ['Todos', 'Pendente', 'Pago', 'Atrasado'];
  readonly finalidadeOptions = ['Mensalidade', 'Campori', 'Acampamento', 'Uniflash', 'Doação', 'Evento', 'Outros'];
  readonly filterFinalidadeOptions = ['Todos', ...this.finalidadeOptions];
  readonly modalStatusOptions: LancamentoStatus[] = ['Pendente', 'Pago', 'Atrasado'];
  readonly modalCategoryOptions: LancamentoCategoria[] = ['Clube', 'Evento'];
  readonly modalFluxoOptions: Array<{ value: LancamentoTipoFluxo; label: string }> = [
    { value: 'Entrada', label: 'Entrada' },
    { value: 'Saida', label: 'Saída' },
  ];

  /** Janela de até 5 páginas ao redor da atual (a API pode ter dezenas de páginas). */
  readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const start = Math.max(1, Math.min(this.page() - 2, total - 4));
    const end = Math.min(total, start + 4);
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly paginationInfo = computed(() => {
    const total = this.total();

    if (total === 0) {
      return { start: 0, end: 0, totalItems: 0 };
    }

    const start = (this.page() - 1) * this.pageSize() + 1;
    return { start, end: Math.min(start + this.items().length - 1, total), totalItems: total };
  });

  readonly modalTitle = computed(() => {
    switch (this.modalMode()) {
      case 'edit':
        return 'Editar lançamento';
      case 'view':
        return this.selected()?.lancamentoOrigemId ? 'Detalhes da devolução' : 'Detalhes do lançamento';
      case 'delete':
        return 'Excluir lançamento';
      case 'registrarDevolucao':
        return 'Registrar devolução';
      case 'corrigirDevolucao':
        return 'Corrigir devolução';
      default:
        return 'Novo lançamento';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    this.listRequest?.unsubscribe();
  }

  // ---- Lista -------------------------------------------------------------------------------

  load(): void {
    this.listRequest?.unsubscribe();
    if (!this.permissoes.tem(CONSULTAR_LANCAMENTOS)) {
      this.items.set([]);
      this.total.set(0);
      this.totalPages.set(1);
      this.loading.set(false);
      this.listError.set('Você não tem permissão para consultar os lançamentos.');
      return;
    }
    this.loading.set(true);
    this.listError.set('');

    this.listRequest = this.lancamentosService
      .list({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search().trim(),
        status: this.selectedStatus(),
        finalidade: this.selectedFinalidade(),
        vencimento: this.selectedDate(),
      })
      .subscribe({
        next: response => {
          this.items.set(response.items);
          this.total.set(response.total);
          this.totalPages.set(response.totalPages);
          this.page.set(response.page);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.items.set([]);
          this.total.set(0);
          this.totalPages.set(1);
          this.listError.set(this.describe(error, 'Não foi possível carregar os lançamentos.'));
          this.loading.set(false);
        },
      });
  }

  onSearchChange(value: string): void {
    this.search.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applyFilters(), SEARCH_DEBOUNCE_MS);
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  goToPage(pageNumber: number): void {
    this.page.set(Math.min(Math.max(pageNumber, 1), this.totalPages()));
    this.load();
  }

  private applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  // ---- Modal -------------------------------------------------------------------------------

  openNewEntry(): void {
    this.modalLancamentoTipo.set('unico');
    this.lancamentoAtual = this.emptyForm();
    this.idempotencyKey = crypto.randomUUID();
    this.openModal('new', null);
    this.loadUsuarios();
  }

  openEditEntry(item: Lancamento): void {
    if (this.isFromEvento(item)) return;
    this.modalLancamentoTipo.set('unico');
    this.lancamentoAtual = {
      membroId: item.membroId ?? '',
      finalidade: item.finalidade ?? '',
      descricao: item.descricao ?? '',
      categoria: item.categoria,
      tipoFluxo: item.tipoFluxo,
      valor: item.valor,
      vencimento: item.vencimento,
      status: item.status,
    };
    this.openModal('edit', item);
  }

  onModalLancamentoTipoChange(tipo: ModalLancamentoTipo): void {
    this.modalLancamentoTipo.set(tipo);
    this.lancamentoAtual.membroId = tipo === 'geral' ? TODOS_OS_MEMBROS : '';
  }

  viewEntry(item: Lancamento): void {
    this.openModal('view', item);
  }

  openDelete(item: Lancamento): void {
    if (this.isFromEvento(item)) return;
    this.motivoExclusao = '';
    this.openModal('delete', item);
  }

  closeModal(): void {
    if (this.modalDevolucaoOcupado()) return;
    const fechandoDevolucao = !!this.modalDevolucao();
    this.modalMode.set(null);
    this.selected.set(null);
    this.formError.set('');
    this.saving.set(false);
    if (fechandoDevolucao) this.restaurarFocoListagem();
  }

  podeRegistrarDevolucao(item: Lancamento): boolean {
    return this.podeAlterarDevolucao(item) && item.status === 'Pendente' && !item.dataPagamento;
  }

  podeCorrigirDevolucao(item: Lancamento): boolean {
    return this.podeAlterarDevolucao(item) && item.status === 'Pago' && !!item.dataPagamento;
  }

  private podeAlterarDevolucao(item: Lancamento): boolean {
    return !!item.lancamentoOrigemId &&
      this.permissoes.tem(CONSULTAR_LANCAMENTOS) &&
      this.permissoes.tem(REGISTRAR_PAGAMENTOS);
  }

  private podeExecutarDevolucao(item: Lancamento, mode: ModalDevolucaoMode): boolean {
    return mode === 'registrarDevolucao'
      ? this.podeRegistrarDevolucao(item)
      : this.podeCorrigirDevolucao(item);
  }

  openDevolucao(item: Lancamento, mode: ModalDevolucaoMode): void {
    if (this.modalMode() || !this.podeExecutarDevolucao(item, mode)) return;

    const correcao = mode === 'corrigirDevolucao';
    this.valorDevolucaoTexto = this.formatCurrencyInput(correcao ? item.valorPago ?? null : item.valor);
    this.dataDevolucao = correcao ? item.dataPagamento ?? '' : '';
    this.justificativaDevolucao = correcao ? item.devolucaoJustificativa ?? '' : '';
    this.errosDevolucao.set({});
    this.revisaoDevolucao.set(null);
    this.devolucaoDesatualizada.set(false);
    this.precisaConsultarDevolucao.set(this.devolucoesAConsultar.has(item.id));
    this.openModal(mode, item);
    if (this.precisaConsultarDevolucao()) this.consultarDevolucao();
  }

  onValorDevolucaoInput(input: HTMLInputElement, event: Event): void {
    const texto = input.value.trim();
    const digitandoNaMascara = (event as InputEvent).inputType === 'insertText' &&
      /^R\$\s*\d{1,3}(?:\.\d{3})*,\d+$/.test(texto);

    let centavos = digitandoNaMascara || /^\d+$/.test(texto) ? texto : '';
    if (!digitandoNaMascara && /^(?:R\$\s*)?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(texto)) {
      centavos = texto.replace(/,\d$/, '$&0');
    }
    if (centavos && centavos.replace(/\D/g, '').length <= 15) {
      input.value = this.formatCurrency(parseCurrencyInput(centavos) ?? 0);
    }
    this.valorDevolucaoTexto = input.value;
  }

  revisarDevolucao(): void {
    const item = this.alvoDevolucao();
    if (!item || this.revisaoDevolucao()) return;

    const erros: ErrosDevolucao = {};
    const texto = this.valorDevolucaoTexto.trim();
    const formatoValido = /^R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}$/.test(texto) &&
      texto.replace(/\D/g, '').length <= 15;
    const valorPago = formatoValido ? parseCurrencyInput(texto) : null;
    const dataPagamento = this.dataDevolucao;
    const justificativa = this.justificativaDevolucao.trim();
    const valorDiferente = valorPago !== null && Math.round(valorPago * 100) !== Math.round(item.valor * 100);

    if (!texto) {
      erros.valorPago = 'Informe o valor devolvido.';
    } else if (!formatoValido) {
      erros.valorPago = 'Informe um valor válido em reais.';
    } else if (valorPago === null) {
      erros.valorPago = 'Informe um valor maior que zero.';
    } else if (Math.round(valorPago * 100) > Math.round(item.valor * 100)) {
      erros.valorPago = 'O valor devolvido não pode superar o valor esperado.';
    }

    if (!dataPagamento) {
      erros.dataPagamento = 'Informe a data da devolução.';
    } else if (!/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(dataPagamento) ||
      new Date(`${dataPagamento}T00:00:00Z`).toJSON()?.slice(0, 10) !== dataPagamento) {
      erros.dataPagamento = 'Informe uma data válida.';
    }

    if (valorDiferente && !justificativa) {
      erros.justificativa = 'Informe a justificativa para devolver um valor diferente do esperado.';
    } else if (this.justificativaDevolucao) {
      if (justificativa.replace(/\s/g, '').length < 3 || justificativa.length > 255) {
        erros.justificativa = 'Use de 3 a 255 caracteres. Espaços não contam para o mínimo.';
      } else if (!cabeEmWindows1252(justificativa)) {
        erros.justificativa = 'Use caracteres compatíveis com Windows-1252, sem emojis ou quebras de linha.';
      }
    }

    this.errosDevolucao.set(erros);
    this.formError.set('');
    if (Object.keys(erros).length || valorPago === null) return;
    this.revisaoDevolucao.set({ valorPago, dataPagamento, justificativa: justificativa || null });
    this.focarDevolucao();
  }

  voltarDevolucao(): void {
    if (this.modalDevolucaoOcupado()) return;
    this.revisaoDevolucao.set(null);
    this.focarDevolucao();
  }

  confirmarDevolucao(): void {
    const item = this.alvoDevolucao();
    const payload = this.revisaoDevolucao();
    const mode = this.modalDevolucao();
    if (!item || !payload || !mode) return;

    this.saving.set(true);
    const registro = mode === 'registrarDevolucao';
    const operacao = registro
      ? this.lancamentosService.registrarDevolucao(item.id, payload)
      : this.lancamentosService.corrigirDevolucao(item.id, payload);
    operacao.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: atualizado => {
        this.saving.set(false);
        this.atualizarItemDevolucao(atualizado);
        this.closeModal();
        this.load();
        this.toast.success(registro ? 'Devolução registrada com sucesso.' : 'Devolução corrigida com sucesso.');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.revisaoDevolucao.set(null);
        const mensagem = this.erroDevolucao(error);
        this.formError.set(mensagem);
        if (!(error instanceof HttpErrorResponse) || error.status !== 401) this.toast.error(mensagem);
        if (!(error instanceof HttpErrorResponse) || error.status === 0 || error.status === 409 || error.status >= 500) {
          this.devolucoesAConsultar.add(item.id);
          this.precisaConsultarDevolucao.set(true);
          this.consultarDevolucao();
        } else {
          this.focarDevolucao();
        }
      },
    });
  }

  consultarDevolucao(): void {
    const item = this.selected();
    const mode = this.modalDevolucao();
    if (!item || !mode || this.modalDevolucaoOcupado() || !this.precisaConsultarDevolucao() ||
      !this.permissoes.tem(CONSULTAR_LANCAMENTOS)) return;

    this.consultandoDevolucao.set(true);
    this.lancamentosService.getById(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: atual => {
        this.consultandoDevolucao.set(false);
        this.precisaConsultarDevolucao.set(false);
        this.devolucoesAConsultar.delete(item.id);
        this.atualizarItemDevolucao(atual);
        this.selected.set(atual);

        if (!this.podeExecutarDevolucao(atual, mode) || atual.valor !== item.valor ||
          atual.valorPago !== item.valorPago || atual.dataPagamento !== item.dataPagamento ||
          atual.devolucaoJustificativa !== item.devolucaoJustificativa ||
          atual.pagamentoRegistradoEmUtc !== item.pagamentoRegistradoEmUtc) {
          this.devolucaoDesatualizada.set(true);
          const estado = atual.status === 'Pago' ? 'A API retornou a devolução como concluída.' : 'A API retornou novos dados da devolução.';
          this.formError.update(mensagem => [mensagem, estado, 'Feche o formulário para consultar a listagem atualizada.'].filter(Boolean).join(' '));
          this.load();
        } else {
          this.formError.update(mensagem => [mensagem, 'A devolução foi consultada e você pode revisar os dados e tentar novamente.'].filter(Boolean).join(' '));
        }
        this.focarDevolucao();
      },
      error: (error: unknown) => {
        this.consultandoDevolucao.set(false);
        this.formError.set(`Não foi possível verificar o estado atual. ${this.erroDevolucao(error)}`);
        this.focarDevolucao();
      },
    });
  }

  private alvoDevolucao(): Lancamento | null {
    const item = this.selected();
    const mode = this.modalDevolucao();
    if (!item || !mode || this.modalDevolucaoOcupado() ||
      this.precisaConsultarDevolucao() || this.devolucaoDesatualizada()) return null;
    if (!this.podeExecutarDevolucao(item, mode)) {
      this.formError.set('Esta operação não está disponível para o lançamento ou para suas permissões atuais.');
      return null;
    }
    return item;
  }

  private atualizarItemDevolucao(atualizado: Lancamento): void {
    this.items.update(items => items.map(item => item.id === atualizado.id ? atualizado : item));
  }

  private focarDevolucao(): void {
    afterNextRender(() => this.devolucaoFocus()?.nativeElement.focus(), { injector: this.injector });
  }

  private restaurarFocoListagem(): void {
    afterNextRender(() => {
      const heading = this.listHeading()?.nativeElement;
      if (heading?.ownerDocument.activeElement === heading?.ownerDocument.body) heading?.focus();
    }, { injector: this.injector });
  }

  private erroDevolucao(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
      if (error.status === 403) return 'Você não tem permissão para esta operação.';
      if (error.status === 409) {
        return error.error?.detail ?? error.error?.title ?? 'O estado da devolução foi alterado.';
      }
      if (error.status === 400) {
        const erros: ErrosDevolucao = {};
        const campos = ['valorPago', 'dataPagamento', 'justificativa'] as const;
        for (const [chave, mensagens] of Object.entries(error.error?.errors ?? {})) {
          const campo = campos.find(nome => nome.toLowerCase() === chave.toLowerCase());
          if (campo && Array.isArray(mensagens) && typeof mensagens[0] === 'string') erros[campo] = mensagens[0];
        }
        this.errosDevolucao.set(erros);
      }
    } else if (error instanceof Error && error.name === 'TimeoutError') {
      return 'O servidor demorou para responder. A operação não foi confirmada.';
    }
    return this.describe(error, 'Não foi possível concluir a operação.');
  }

  submit(): void {
    if (this.saving()) {
      return;
    }
    const selecionado = this.selected();
    if (selecionado && this.isFromEvento(selecionado) && ['edit', 'delete'].includes(this.modalMode() ?? '')) return;

    switch (this.modalMode()) {
      case 'new':
        if (this.permissoes.tem('financeiro.lancamentos.criar')) this.salvarNovo();
        return;
      case 'edit':
        if (this.permissoes.tem('financeiro.lancamentos.editar')) this.salvarEdicao();
        return;
      case 'delete':
        if (this.permissoes.tem('financeiro.lancamentos.excluir')) this.excluir();
        return;
      default:
        return this.closeModal();
    }
  }

  private salvarNovo(): void {
    const form = this.lancamentoAtual;
    const todos = form.membroId === TODOS_OS_MEMBROS;
    const invalid = this.validate(form, !todos && !form.membroId ? 'Selecione o beneficiário.' : '');

    if (invalid) {
      this.formError.set(invalid);
      return;
    }

    const payload: RegistrarLancamentoInput = {
      finalidade: form.finalidade.trim(),
      descricao: form.descricao.trim() || null,
      categoria: form.categoria,
      tipoFluxo: form.tipoFluxo,
      valor: Number(form.valor),
      vencimento: form.vencimento,
      ...(todos ? { aplicarATodosOsMembros: true } : { membroId: form.membroId }),
    };

    this.saving.set(true);
    this.formError.set('');
    // A mesma Idempotency-Key em novas tentativas evita duplicar o lote se a resposta se perder.
    this.lancamentosService.registrar(payload, todos ? this.idempotencyKey : undefined).subscribe({
      next: () => this.afterMutation(true),
      error: (error: unknown) => this.failMutation(error),
    });
  }

  private salvarEdicao(): void {
    const item = this.selected();
    const form = this.lancamentoAtual;
    const invalid = this.validate(form);

    if (!item || invalid) {
      this.formError.set(invalid);
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.lancamentosService
      .update(item.id, {
        finalidade: form.finalidade.trim(),
        descricao: form.descricao.trim() || null,
        categoria: form.categoria,
        tipoFluxo: form.tipoFluxo,
        valor: Number(form.valor),
        vencimento: form.vencimento,
        status: form.status,
      })
      .subscribe({
        next: () => this.afterMutation(false),
        error: (error: unknown) => this.failMutation(error),
      });
  }

  private excluir(): void {
    const item = this.selected();
    const motivo = this.motivoExclusao.trim();

    if (!item) {
      return;
    }

    if (!motivo) {
      this.formError.set('Informe o motivo da exclusão.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');
    this.lancamentosService.remove(item.id, motivo).subscribe({
      next: () => this.afterMutation(false),
      error: (error: unknown) => this.failMutation(error),
    });
  }

  private afterMutation(backToFirstPage: boolean): void {
    this.closeModal();
    if (backToFirstPage) {
      this.page.set(1);
    }
    this.load();
  }

  private failMutation(error: unknown): void {
    this.saving.set(false);
    this.formError.set(this.describe(error, 'Não foi possível concluir a operação.'));
  }

  private loadUsuarios(): void {
    if (this.usuarios().length > 0) {
      return;
    }

    this.usuariosError.set('');
    this.usuarioService.listarMembros().subscribe({
      next: usuarios => this.usuarios.set([...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))),
      error: (error: unknown) =>
        this.usuariosError.set(this.describe(error, 'Não foi possível carregar os membros.')),
    });
  }

  private openModal(mode: ModalMode, item: Lancamento | null): void {
    if (this.modalDevolucaoOcupado()) return;
    this.formError.set('');
    this.saving.set(false);
    this.selected.set(item);
    this.modalMode.set(mode);
  }

  private validate(form: LancamentoForm, extra = ''): string {
    if (extra) {
      return extra;
    }
    if (!form.finalidade.trim()) {
      return 'Informe a finalidade.';
    }
    if (!(Number(form.valor) > 0)) {
      return 'Informe um valor maior que zero.';
    }
    if (!form.vencimento) {
      return 'Informe a data de vencimento.';
    }
    return '';
  }

  private emptyForm(): LancamentoForm {
    return {
      membroId: '',
      finalidade: 'Mensalidade',
      descricao: '',
      categoria: 'Clube',
      tipoFluxo: 'Entrada',
      valor: null,
      vencimento: '',
      status: 'Pendente',
    };
  }

  // ---- Apresentação ------------------------------------------------------------------------

  /** Lançamentos gerados por eventos só podem ser alterados em /api/Eventos. */
  isFromEvento(item: Lancamento): boolean {
    return !!item.eventoId || !!item.lancamentoOrigemId;
  }

  eventoDaDevolucao(item: Lancamento): string | null | undefined {
    return item.descricao?.replace(/^Devolução - Evento - /, '') || item.eventoId;
  }

  fluxoLabel(fluxo: LancamentoTipoFluxo): string {
    return fluxo === 'Saida' ? 'Saída' : 'Entrada';
  }

  /** yyyy-MM-dd → dd/MM/yyyy sem passar por Date (evita deslocamento de fuso). */
  formatDate(value: string): string {
    const [year, month, day] = (value ?? '').slice(0, 10).split('-');
    return year && month && day ? `${day}/${month}/${year}` : (value ?? '');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  formatCurrencyInput(value: number | null): string {
    return value === null ? '' : this.formatCurrency(value);
  }

  /** O modelo segue numérico (contrato da API); o campo é reescrito já mascarado. */
  onValorInput(input: HTMLInputElement): void {
    this.lancamentoAtual.valor = parseCurrencyInput(input.value);
    input.value = this.formatCurrencyInput(this.lancamentoAtual.valor);
  }

  private describe(error: unknown, fallback: string): string {
    if (!(error instanceof HttpErrorResponse)) {
      return fallback;
    }

    switch (error.status) {
      case 0:
        return 'Sem conexão com o servidor.';
      case 403:
        return 'Você não tem permissão para esta operação (restrita à diretoria).';
      case 404:
        return error.error?.title ?? 'Registro não encontrado.';
      case 409:
        return error.error?.title ?? 'Conflito: esta operação já foi registrada com dados diferentes.';
      case 400: {
        const errors = error.error?.errors as Record<string, string[]> | undefined;
        const first = errors ? Object.values(errors).flat()[0] : undefined;
        return first ?? error.error?.title ?? 'Dados inválidos.';
      }
      default:
        return fallback;
    }
  }
}
