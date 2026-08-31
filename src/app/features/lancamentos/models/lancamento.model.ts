export type LancamentoStatus = 'Pago' | 'Pendente' | 'Atrasado';
export type LancamentoTipo = 'Mensalidade' | 'Campori' | 'Acampamento' | 'Uniflash';
export type LancamentoCategoria = 'Clube' | 'Evento';

export interface Lancamento {
  id: string;
  membroId: string;
  membroNome: string;
  tipo: LancamentoTipo;
  descricao: string;
  categoria: LancamentoCategoria;
  valor: number;
  moeda: 'BRL';
  vencimento: string;
  status: LancamentoStatus;
}

export interface LancamentosFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LancamentoStatus | 'Todos';
  tipo?: LancamentoTipo | 'Todos';
  data?: string;
}

export interface LancamentosResponse {
  items: Lancamento[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CreateLancamentoInput {
  membroId: string;
  membroNome: string;
  tipo: LancamentoTipo;
  descricao: string;
  categoria: LancamentoCategoria;
  valor: number;
  moeda?: 'BRL';
  vencimento: string;
  status: LancamentoStatus;
}
