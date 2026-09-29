export interface UserCargo {
  id: string;
  nome: string;
  role: string;
}

export interface User {
  id: string;
  nome: string;
  email: string;
  dataCriacao: string;
  cargo?: UserCargo;
  /** Campo legado retornado por versões anteriores da API. */
  roles?: string;
}

/** Perfil retornado por `GET /api/Auth/Me`. */
export interface CurrentUser {
  id: string;
  nome: string;
  email: string;
  cargo: UserCargo;
}
