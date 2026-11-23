
export interface TesourariaCompetencia {
  ano: number;
  mes: number;
  entradas: number;
  saidas: number;
}

export interface TesourariaResumoResponse {
  receitasDespesas: TesourariaCompetencia[];
}
