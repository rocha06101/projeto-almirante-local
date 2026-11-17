export interface CargoAutorizacao {
  id: string;
  role: string;
  nome: string;
}

export interface MinhasPermissoes {
  cargo: CargoAutorizacao;
  permissoes: string[];
  permissoesPorDesignacao: string[];
  versaoAutorizacao: number;
}