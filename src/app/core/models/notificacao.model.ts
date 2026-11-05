export interface Notificacao {
  id: string;
  tipo?: string | null;
  titulo?: string | null;
  mensagem?: string | null;
  criadaEmUtc?: string | null;
  lidaEmUtc?: string | null;
  eventoId?: string | null;
  lancamentoId?: string | null;
}

export interface NotificacoesPendentesResponse {
  items: Notificacao[];
  naoLidas: number;
  pageSize: number;
  proximoCursor: string | null;
}

export interface MarcarLeituraResponse {
  notificacao: Notificacao;
  naoLidas: number;
}
