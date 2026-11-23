import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api';
import { CriarEvento, EditarEvento, EstornarParticipante, EventoDto, EventoParticipante, EventosResponse, MeusEventosResponse, PeriodoEventos } from '../models/evento.model';

@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly api = inject(ApiService);
  // Mantido apenas em memória para reabrir o formulário após uma resposta incerta.
  readonly cadastroPendente = signal<{ conteudo: CriarEvento; chave: string } | null>(null);

  listar(periodo: PeriodoEventos) {
    return this.api.get<EventosResponse>('/Eventos', { params: { ...periodo } });
  }
  listarMeusEventos() {
    return this.api.get<MeusEventosResponse>('/Me/Eventos');
  }
  obterMeuEvento(id: string) {
    return this.api.get<EventoParticipante>(`/Me/Eventos/${encodeURIComponent(id)}`);
  }
  obter(id: string) {
    return this.api.get<EventoDto>(`/Eventos/${encodeURIComponent(id)}`);
  }
  criar(conteudo: CriarEvento, chave: string) {
    return this.api.post<EventoDto>('/Eventos', conteudo, { headers: { 'Idempotency-Key': chave } });
  }
  editar(id: string, conteudo: EditarEvento) {
    return this.api.put<EventoDto>(`/Eventos/${encodeURIComponent(id)}`, conteudo);
  }
  estornarParticipante(id: string, membroId: string, conteudo: EstornarParticipante) {
    return this.api.post<EventoDto>(`/Eventos/${encodeURIComponent(id)}/Participantes/${encodeURIComponent(membroId)}/Estorno`, conteudo);
  }
  excluir(id: string, versao: string, motivo: string) {
    return this.api.delete<void>(`/Eventos/${encodeURIComponent(id)}`, { body: { versao, motivo } });
  }
}
