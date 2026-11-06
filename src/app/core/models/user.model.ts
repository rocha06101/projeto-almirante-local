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

/** Endereço aceito pelos endpoints de atualização de perfil. Metadados do ViaCEP não são enviados. */
export interface UserAddressUpdate {
  cep?: string;
  numero?: string | null;
  complemento?: string | null;
}

/** Item de `GET /api/Usuarios` (UsuarioListItemDto); também é a resposta de POST e PUT. */
export interface User {
  id: string;
  nome: string;
  email: string;
  dataCriacao: string;
  cpf?: string | null;
  rg?: string | null;
  ehCin?: boolean;
  dataNascimento?: string | null;
  telefone?: string | null;
  dataExpiracao?: string | null;
  responsavelNome?: string | null;
  responsavelEmail?: string | null;
  responsavelCpf?: string | null;
  responsavelTelefone?: string | null;
  /** Rota autenticada da foto; o frontend deve buscá-la como blob, não usar diretamente em <img src>. */
  fotoUrl?: string | null;
  tipoSanguineo?: string | null;
  doencasAlergias?: string | null;
  endereco?: UserAddress | null;
  cargo?: UserCargo | null;
  cargoId?: string;
  /** Nome do cargo (ex.: "Diretor"), igual a `cargo.nome`. */
  funcao?: string;
  /** `false` para usuários excluídos logicamente (só aparecem com `includeInactive=true`). */
  ativo?: boolean;
  /** Campo legado retornado por versões anteriores da API. */
  roles?: string;
}

/** Perfil completo retornado por `GET /api/Me`; não é o perfil básico de `GET /api/Auth/Me`. */
export interface MyProfileResponse extends Omit<User, 'dataCriacao'> {
  dataCriacao?: string;
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
  cpf: string;
  rg?: string | null;
  ehCin: boolean;
  dataNascimento?: string | null;
  telefone?: string | null;
  tipoSanguineo: string | null;
  doencasAlergias: string | null;
  endereco?: UserAddressRequest;
}

/** Corpo de `PUT /api/Usuarios/{id}`: a API não altera senha nem situação (ativo/inativo) por aqui. */
export interface UpdateUserRequest {
  nome: string;
  email: string;
  cargoId: string;
  cpf?: string;
  dataNascimento?: string | null;
  telefone?: string | null;
  rg?: string | null;
  ehCin: boolean;
  tipoSanguineo?: string | null;
  doencasAlergias?: string | null;
  endereco?: UserAddressUpdate;
}

/** Corpo de `PUT /api/Me`; propriedades ausentes preservam os valores armazenados. */
export interface UpdateMyProfileRequest {
  cpf?: string;
  dataNascimento?: string | null;
  telefone?: string | null;
  rg?: string | null;
  ehCin: boolean;
  tipoSanguineo?: string | null;
  doencasAlergias?: string | null;
  endereco?: UserAddressUpdate;
}

export interface ListUsersOptions {
  /** Inclui os usuários excluídos logicamente (`?includeInactive=true`). */
  includeInactive?: boolean;
}
