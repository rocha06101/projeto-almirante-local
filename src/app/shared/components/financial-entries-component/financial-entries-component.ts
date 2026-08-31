import { CommonModule, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { StatusBadgeComponent } from '../../../features/lancamentos/components/status-badge/status-badge';

type LancamentoStatus = 'Pago' | 'Pendente' | 'Atrasado';

type LancamentoTipo =
  | 'Mensalidade'
  | 'Campori'
  | 'Acampamento'
  | 'Uniflash'
  | 'Doação'
  | 'Evento'
  | 'Outros';

interface LancamentoMock {
  id: string;
  nome: string;
  tipo: LancamentoTipo;
  categoria: 'Clube' | 'Evento';
  valor: number;
  vencimento: string;
  status: LancamentoStatus;
}

interface LancamentoForm {
  nome: string;
  tipo: LancamentoTipo;
  categoria: 'Clube' | 'Evento';
  valor: number;
  vencimento: string;
  status: LancamentoStatus;
}

@Component({
  selector: 'app-financial-entries-component',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
  providers: [DatePipe],
  templateUrl: './financial-entries-component.html',
  styleUrl: './financial-entries-component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialEntriesComponent {
  readonly page = signal(1);
  readonly pageSize = signal(4);
  readonly search = signal('');
  readonly selectedStatus = signal<'Todos' | LancamentoStatus>('Todos');
  readonly selectedType = signal<'Todos' | LancamentoTipo>('Todos');
  readonly selectedDate = signal('');
  readonly isModalOpen = signal(false);
  readonly modalTitle = signal('Novo lançamento');
  readonly editingId = signal<string | null>(null);

  lancamentoAtual: LancamentoForm = {
    nome: '',
    tipo: 'Mensalidade',
    categoria: 'Clube',
    valor: 0,
    vencimento: '',
    status: 'Pago',
  };

  readonly mockLancamentos: LancamentoMock[] = [
    { id: '1', nome: 'Guilherme', tipo: 'Mensalidade', categoria: 'Clube', valor: 20, vencimento: '10/08/2026', status: 'Pago' },
    { id: '2', nome: 'Guilherme', tipo: 'Campori', categoria: 'Evento', valor: 200, vencimento: '20/02/2027', status: 'Pago' },
    { id: '3', nome: 'Guilherme', tipo: 'Acampamento', categoria: 'Evento', valor: 50, vencimento: '16/04/2026', status: 'Pago' },
    { id: '4', nome: 'Guilherme', tipo: 'Uniflash', categoria: 'Evento', valor: 5, vencimento: '29/05/2026', status: 'Pago' },
    { id: '5', nome: 'Mateus', tipo: 'Mensalidade', categoria: 'Clube', valor: 25, vencimento: '11/08/2026', status: 'Pendente' },
    { id: '6', nome: 'Pedro', tipo: 'Campori', categoria: 'Evento', valor: 180, vencimento: '01/03/2027', status: 'Atrasado' },
    { id: '7', nome: 'Ana', tipo: 'Doação', categoria: 'Clube', valor: 75, vencimento: '12/08/2026', status: 'Pago' },
    { id: '8', nome: 'Julia', tipo: 'Evento', categoria: 'Evento', valor: 120, vencimento: '02/04/2026', status: 'Pendente' },
    { id: '9', nome: 'Arthur', tipo: 'Mensalidade', categoria: 'Clube', valor: 30, vencimento: '15/08/2026', status: 'Pago' },
    { id: '10', nome: 'Beatriz', tipo: 'Acampamento', categoria: 'Evento', valor: 90, vencimento: '18/05/2026', status: 'Atrasado' },
    { id: '11', nome: 'Lucas', tipo: 'Uniflash', categoria: 'Evento', valor: 15, vencimento: '21/05/2026', status: 'Pago' },
    { id: '12', nome: 'Rafael', tipo: 'Mensalidade', categoria: 'Clube', valor: 35, vencimento: '18/08/2026', status: 'Pendente' },
    { id: '13', nome: 'Sofia', tipo: 'Campori', categoria: 'Evento', valor: 210, vencimento: '08/03/2027', status: 'Pago' },
    { id: '14', nome: 'Marina', tipo: 'Doação', categoria: 'Clube', valor: 50, vencimento: '22/08/2026', status: 'Pago' },
    { id: '15', nome: 'João', tipo: 'Evento', categoria: 'Evento', valor: 140, vencimento: '17/04/2026', status: 'Atrasado' },
    { id: '16', nome: 'Letícia', tipo: 'Mensalidade', categoria: 'Clube', valor: 27, vencimento: '19/08/2026', status: 'Pago' },
    { id: '17', nome: 'Gabriel', tipo: 'Acampamento', categoria: 'Evento', valor: 110, vencimento: '25/06/2026', status: 'Pendente' },
    { id: '18', nome: 'Alice', tipo: 'Uniflash', categoria: 'Evento', valor: 12, vencimento: '30/05/2026', status: 'Pago' },
    { id: '19', nome: 'Thiago', tipo: 'Campori', categoria: 'Evento', valor: 190, vencimento: '07/03/2027', status: 'Pendente' },
    { id: '20', nome: 'Camila', tipo: 'Mensalidade', categoria: 'Clube', valor: 22, vencimento: '20/08/2026', status: 'Pago' },
  ];

  readonly statusOptions: Array<'Todos' | LancamentoStatus> = ['Todos', 'Pago', 'Pendente', 'Atrasado'];
  readonly typeOptions: Array<'Todos' | LancamentoTipo> = [
    'Todos',
    'Mensalidade',
    'Campori',
    'Acampamento',
    'Uniflash',
    'Doação',
    'Evento',
    'Outros',
  ];
  readonly modalStatusOptions: LancamentoStatus[] = ['Pago', 'Pendente', 'Atrasado'];
  readonly modalTypeOptions: LancamentoTipo[] = ['Mensalidade', 'Campori', 'Acampamento', 'Uniflash', 'Doação', 'Evento', 'Outros'];
  readonly modalCategoryOptions: Array<'Clube' | 'Evento'> = ['Clube', 'Evento'];

  readonly filteredLancamentos = computed(() => {
    const query = this.search().trim().toLowerCase();
    const statusFilter = this.selectedStatus();
    const typeFilter = this.selectedType();
    const dateFilter = this.selectedDate();

    return this.mockLancamentos.filter(item => {
      const matchesQuery =
        !query ||
        item.nome.toLowerCase().includes(query) ||
        item.tipo.toLowerCase().includes(query) ||
        item.categoria.toLowerCase().includes(query);

      const matchesStatus = statusFilter === 'Todos' || item.status === statusFilter;
      const matchesType = typeFilter === 'Todos' || item.tipo === typeFilter;
      const matchesDate =
        !dateFilter || this.convertToIsoDate(item.vencimento) === this.normalizeDateForComparison(dateFilter);

      return matchesQuery && matchesStatus && matchesType && matchesDate;
    });
  });

  readonly pageNumbers = computed(() => {
    const totalPages = Math.max(1, Math.ceil(this.filteredLancamentos().length / this.pageSize()));
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  });

  readonly displayedLancamentos = computed(() => {
    const totalItems = this.filteredLancamentos().length;
    const maxPage = Math.max(1, Math.ceil(totalItems / this.pageSize()));

    if (this.page() > maxPage) {
      this.page.set(maxPage);
    }

    const start = (this.page() - 1) * this.pageSize();
    return this.filteredLancamentos().slice(start, start + this.pageSize());
  });

  readonly paginationInfo = computed(() => {
    const totalItems = this.filteredLancamentos().length;

    if (totalItems === 0) {
      return { start: 0, end: 0, totalItems };
    }

    const start = (this.page() - 1) * this.pageSize() + 1;
    const end = Math.min(this.page() * this.pageSize(), totalItems);

    return { start, end, totalItems };
  });

  onSearchChange(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  onFilterChange(): void {
    this.page.set(1);
  }

  openNewEntry(): void {
    this.modalTitle.set('Novo lançamento');
    this.editingId.set(null);
    this.lancamentoAtual = {
      nome: '',
      tipo: 'Mensalidade',
      categoria: 'Clube',
      valor: 0,
      vencimento: '',
      status: 'Pago',
    };
    this.isModalOpen.set(true);
  }

  openEditEntry(item: LancamentoMock): void {
    this.modalTitle.set('Editar Lançamento');
    this.editingId.set(item.id);
    this.lancamentoAtual = {
      nome: item.nome,
      tipo: item.tipo,
      categoria: item.categoria,
      valor: item.valor,
      vencimento: this.toIsoDate(item.vencimento),
      status: item.status,
    };
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.editingId.set(null);
    this.modalTitle.set('Novo lançamento');
    this.lancamentoAtual = {
      nome: '',
      tipo: 'Mensalidade',
      categoria: 'Clube',
      valor: 0,
      vencimento: '',
      status: 'Pago',
    };
  }

  salvarNovoLancamento(): void {
    const lancamento = {
      id: `mock-${Date.now()}`,
      nome: this.lancamentoAtual.nome.trim(),
      tipo: this.lancamentoAtual.tipo,
      categoria: this.lancamentoAtual.categoria,
      valor: Number(this.lancamentoAtual.valor) || 0,
      vencimento: this.toDisplayDate(this.lancamentoAtual.vencimento),
      status: this.lancamentoAtual.status,
    };

    if (!lancamento.nome) {
      return;
    }

    this.mockLancamentos.unshift(lancamento);
    this.closeModal();
    this.page.set(1);
  }

  salvarEdicao(): void {
    const idAtual = this.editingId();
    if (!idAtual) {
      return;
    }

    const index = this.mockLancamentos.findIndex(item => item.id === idAtual);
    if (index === -1) {
      return;
    }

    this.mockLancamentos[index] = {
      ...this.mockLancamentos[index],
      nome: this.lancamentoAtual.nome.trim(),
      tipo: this.lancamentoAtual.tipo,
      categoria: this.lancamentoAtual.categoria,
      valor: Number(this.lancamentoAtual.valor) || 0,
      vencimento: this.toDisplayDate(this.lancamentoAtual.vencimento),
      status: this.lancamentoAtual.status,
    };

    this.closeModal();
    this.page.set(1);
  }

  viewEntry(item: LancamentoMock): void {
    console.log('Visualizar lançamento', item);
  }

  goToPage(pageNumber: number): void {
    const maxPage = Math.max(1, Math.ceil(this.filteredLancamentos().length / this.pageSize()));
    const nextPage = Math.min(Math.max(pageNumber, 1), maxPage);
    this.page.set(nextPage);
  }

  removeItem(id: string): void {
    const index = this.mockLancamentos.findIndex(item => item.id === id);
    if (index >= 0) {
      this.mockLancamentos.splice(index, 1);
      this.page.set(1);
    }
  }

  private toIsoDate(value: string): string {
    const [day, month, year] = value.split('/');
    if (!day || !month || !year) {
      return '';
    }

    return `${year}-${month}-${day}`;
  }

  private toDisplayDate(value: string): string {
    if (!value) {
      return '';
    }

    const [year, month, day] = value.split('-');
    if (!year || !month || !day) {
      return value;
    }

    return `${day}/${month}/${year}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  }

  private normalizeDateForComparison(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private convertToIsoDate(value: string): string {
    const [day, month, year] = value.split('/');
    if (!day || !month || !year) {
      return value;
    }

    return `${year}-${month}-${day}`;
  }
}

