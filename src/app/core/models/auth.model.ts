export interface CsrfResponse {
  csrfToken: string;
}

export interface LoginRequest {
  email: string;
  senha: string;
}

export interface TokenResponse {
  accessToken: string;
  expiresAtUtc: string;
}

export interface LoginResponse {
  token: TokenResponse;
}

export interface UsuarioLogado {
  id: string;
  nome: string;
  email: string;
  cargo: {
    id: string;
    nome: string;
    role: string;
  };
}