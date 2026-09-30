export interface UserCargo {
  id: string;
  nome: string;
  role: string;
}

/** Item de `GET /api/Usuarios` (UsuarioListItemDto); também é a resposta de POST e PUT. */
export interface User {
  id: string;
  nome: string;
  email: string;
  dataCriacao: string;
  cargo?: UserCargo;
  /** Nome do cargo (ex.: "Diretor"), igual a `cargo.nome`. */
  funcao?: string;
  /** `false` para usuários excluídos logicamente (só aparecem com `includeInactive=true`). */
  ativo?: boolean;
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

/** Item de `GET /api/Cargos` (somente os campos usados pelo frontend). */
export interface Cargo {
  id: string;
  nome: string;
  descricao: string;
  /** Somente cargos ativos são aceitos em `cargoId` no cadastro/alteração. */
  ativo: boolean;
  role: string;
}

/** Corpo de `POST /api/Usuarios`. */
export interface CreateUserRequest {
  nome: string;
  email: string;
  senha: string;
  cargoId: string;
}

/** Corpo de `PUT /api/Usuarios/{id}`: a API não altera senha nem situação (ativo/inativo) por aqui. */
export interface UpdateUserRequest {
  nome: string;
  email: string;
  cargoId: string;
}

export interface ListUsersOptions {
  /** Inclui os usuários excluídos logicamente (`?includeInactive=true`). */
  includeInactive?: boolean;
}
