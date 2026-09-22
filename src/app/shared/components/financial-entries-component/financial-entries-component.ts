import { A11yModule } from '@angular/cdk/a11y';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { StatusBadgeComponent } from '../../../features/lancamentos/components/status-badge/status-badge';
import {
  Lancamento,
  LancamentoCategoria,
  LancamentoStatus,
  LancamentoTipoFluxo,
  RegistrarLancamentoInput,
} from '../../../features/lancamentos/models/lancamento.model';
import { LancamentosService } from '../../../features/lancamentos/services/lancamentos.service';
import { User as UsuarioModel } from '../../../core/models/user.model';
import { User as UsuarioService } from '../../../core/services/user';

type ModalMode = 'new' | 'edit' | 'view' | 'delete';

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
  private readonly usuarioService = inject(UsuarioService);

  private searchTimer?: ReturnType<typeof setTimeout>;
  private idempotencyKey = '';

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
  readonly selected = signal<Lancamento | null>(null);
  readonly saving = signal(false);
  readonly formError = signal('');
  readonly usuarios = signal<UsuarioModel[]>([]);
  readonly usuariosError = signal('');
  motivoExclusao = '';
  lancamentoAtual: LancamentoForm = this.emptyForm();

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
        return 'Detalhes do lançamento';
      case 'delete':
        return 'Excluir lançamento';
      default:
        return 'Novo lançamento';
    }
  });

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
  }

  // ---- Lista -------------------------------------------------------------------------------

  load(): void {
    this.loading.set(true);
    this.listError.set('');

    this.lancamentosService
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
    this.lancamentoAtual = this.emptyForm();
    this.idempotencyKey = crypto.randomUUID();
    this.openModal('new', null);
    this.loadUsuarios();
  }

  openEditEntry(item: Lancamento): void {
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

  viewEntry(item: Lancamento): void {
    this.openModal('view', item);
  }

  openDelete(item: Lancamento): void {
    this.motivoExclusao = '';
    this.openModal('delete', item);
  }

  closeModal(): void {
    this.modalMode.set(null);
    this.selected.set(null);
    this.formError.set('');
    this.saving.set(false);
  }

  submit(): void {
    switch (this.modalMode()) {
      case 'new':
        return this.salvarNovo();
      case 'edit':
        return this.salvarEdicao();
      case 'delete':
        return this.excluir();
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
    this.usuarioService.listarUsuarios().subscribe({
      next: usuarios => this.usuarios.set([...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))),
      error: (error: unknown) =>
        this.usuariosError.set(this.describe(error, 'Não foi possível carregar os membros.')),
    });
  }

  private openModal(mode: ModalMode, item: Lancamento | null): void {
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
    return !!item.eventoId;
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
