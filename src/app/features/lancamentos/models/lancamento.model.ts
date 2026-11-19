/**
 * Contrato de /api/Lancamentos (Swagger do backend; enums serializados como texto).
 * O acesso a cada operação depende das permissões financeiras.
 */
export type LancamentoStatus = 'Pendente' | 'Pago' | 'Atrasado';
export type LancamentoCategoria = 'Evento' | 'Clube';
export type LancamentoTipoFluxo = 'Entrada' | 'Saida';

export interface Lancamento {
  id: string;
  membroId: string | null;
  membroNome: string;
  finalidade: string | null;
  descricao: string | null;
  categoria: LancamentoCategoria;
  tipoFluxo: LancamentoTipoFluxo;
  valor: number;
  /** Data (sem hora) no formato yyyy-MM-dd. */
  vencimento: string;
  status: LancamentoStatus;
  /** Presente quando o lançamento foi gerado por um evento (edição só por /api/Eventos). */
  eventoId?: string | null;
  dataPagamento?: string | null;
  valorPago?: number | null;
  valorRestante?: number | null;
  pagamentoRegistradoEmUtc?: string | null;
  /** Identifica uma devolução de evento e referencia o pagamento original. */
  lancamentoOrigemId?: string | null;
  devolucaoMotivo?: string | null;
  devolucaoJustificativa?: string | null;
}

/** Corpo de RegistrarDevolucaoRequest e AtualizarDevolucaoRequest. A resposta é LancamentoDto. */
export interface DevolucaoLancamentoInput {
  /** Data civil no formato yyyy-MM-dd. */
  dataPagamento: string;
  valorPago: number;
  justificativa: string | null;
}

export interface LancamentosFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: LancamentoStatus | 'Todos';
  finalidade?: string | 'Todos';
  /** yyyy-MM-dd */
  vencimento?: string;
}

export interface LancamentosResponse {
  items: Lancamento[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** POST /api/Lancamentos/Registrar */
export interface RegistrarLancamentoInput {
  /** Obrigatório, exceto com aplicarATodosOsMembros (aí deve ser omitido). */
  membroId?: string | null;
  finalidade: string;
  descricao?: string | null;
  categoria: LancamentoCategoria;
  tipoFluxo: LancamentoTipoFluxo;
  valor: number;
  vencimento: string;
  aplicarATodosOsMembros?: boolean;
}

/** Resposta do lançamento em lote (200) — o lançamento individual responde 201 com o Lancamento. */
export interface LancamentoGeralResponse {
  operacaoId: string;
  usuariosProcessados: number;
  lancamentosCriados: number;
  dataHoraUtc: string;
}

/** PUT /api/Lancamentos/{id} — todos os campos são opcionais. */
export type UpdateLancamentoInput = Partial<
  Pick<Lancamento, 'finalidade' | 'descricao' | 'categoria' | 'tipoFluxo' | 'valor' | 'vencimento' | 'status'>
>;
