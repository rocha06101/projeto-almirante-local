/** Contrato de EventoDtos.cs. Datas civis e rowversion opaca, sem conversão UTC. */
export interface EventoConteudo {
  dataEvento: string;
  local: string;
  transporte: { valor: number; ehGratis: boolean };
  alimentacao: { individual: boolean; valor: number };
  seguroObrigatorio: number;
  membros: string[];
}

export interface CriarEvento extends EventoConteudo {
  titulo: string;
  descricao: string | null;
  eventoReferenciaId?: string | null;
}

export interface EditarEvento extends EventoConteudo {
  titulo: string;
  descricao: string | null;
  versao: string;
  motivo?: string;
}

export interface EventoLancamento {
  id: string;
  membroId: string;
  valor: number;
  status: 'Pendente' | 'Pago' | 'Atrasado';
}

/** EventoDevolucaoDto: Saída separada da cobrança original, nunca editada pelo evento. */
export interface EventoDevolucao {
  id: string;
  membroId: string;
  lancamentoOrigemId: string;
  valor: number;
  vencimento: string;
  status: 'Pendente' | 'Pago' | 'Atrasado';
  valorDevolvido: number | null;
  dataDevolucao: string | null;
  motivo: string | null;
  justificativa: string | null;
}

export interface EstornarParticipante { motivo: string; versao: string }

export interface EventoDto extends EventoConteudo {
  // Versões anteriores da API não devolvem estes campos.
  titulo?: string;
  descricao?: string | null;
  id: string;
  eventoGrupoId: string;
  eventoReferenciaId: string | null;
  quantidadeMembros: number;
  valorPorMembro: number;
  total: number;
  ativo: boolean;
  versao: string;
  lancamentos: EventoLancamento[];
  /** Ausente em APIs anteriores à #209; não significa uma lista vazia confirmada. */
  devolucoes?: EventoDevolucao[];
}

export interface PeriodoEventos { dataInicial: string; dataFinal: string }
export interface EventosResponse extends PeriodoEventos {
  items: EventoDto[];
  dataMinimaCadastro: string;
}
