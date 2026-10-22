export interface UserCargo {
  id: string;
  nome: string;
  role: string;
}

/** Endereço retornado pela API de usuários e por `GET /api/Cep/{cep}`. */
export interface UserAddress {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  complementoCep?: string | null;
  unidade?: string | null;
  bairro?: string | null;
  localidade?: string | null;
  uf?: string | null;
  estado?: string | null;
  regiao?: string | null;
  ibge?: string | null;
  gia?: string | null;
  ddd?: string | null;
  siafi?: string | null;
}

/** Resposta de consulta do CEP; o ViaCEP sinaliza CEP inexistente com `erro`. */
export interface CepLookupResponse extends UserAddress {
  erro?: boolean;
}

/** Campos de endereço editáveis no cadastro; os metadados do ViaCEP são preservados quando disponíveis. */
export interface UserAddressRequest extends UserAddress {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
}

/** Item de `GET /api/Usuarios` (UsuarioListItemDto); também é a resposta de POST e PUT. */
export interface User {
  id: string;
  nome: string;
  email: string;
  dataCriacao: string;
  tipoSanguineo?: string | null;
  doencasAlergias?: string | null;
  endereco?: UserAddress | null;
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
  tipoSanguineo: string | null;
  doencasAlergias: string | null;
  endereco?: UserAddressRequest;
}

/** Corpo de `PUT /api/Usuarios/{id}`: a API não altera senha nem situação (ativo/inativo) por aqui. */
export interface UpdateUserRequest {
  nome: string;
  email: string;
  cargoId: string;
  tipoSanguineo: string | null;
  doencasAlergias: string | null;
  endereco?: UserAddressRequest;
}

export interface ListUsersOptions {
  /** Inclui os usuários excluídos logicamente (`?includeInactive=true`). */
  includeInactive?: boolean;
}
