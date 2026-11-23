import { Injectable, inject, signal } from '@angular/core';
import { map } from 'rxjs';
import { ApiService } from './api';
import { CriarEvento, EditarEvento, EstornarParticipante, EventoDto, EventoParticipante, EventosResponse, MeusEventosResponse, MinhaDevolucao, PeriodoEventos } from '../models/evento.model';

function dataCivilValida(valor: unknown): boolean {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const data = new Date(valor);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}

function resumoPessoalValido(evento: EventoParticipante | null): boolean {
  return !!evento && typeof evento.id === 'string' && typeof evento.local === 'string' &&
    dataCivilValida(evento.dataEvento) && (evento.titulo == null || typeof evento.titulo === 'string');
}

function lancamentoPessoalValido(lancamento: Pick<MinhaDevolucao, 'valor' | 'vencimento' | 'status'>): boolean {
  return !!lancamento && Number.isFinite(lancamento.valor) && dataCivilValida(lancamento.vencimento) &&
    ['Pendente', 'Pago', 'Atrasado'].includes(lancamento.status);
}

function devolucaoValida(devolucao: MinhaDevolucao): boolean {
  return lancamentoPessoalValido(devolucao) &&
    (devolucao.valorDevolvido == null || Number.isFinite(devolucao.valorDevolvido)) &&
    (devolucao.dataDevolucao == null || dataCivilValida(devolucao.dataDevolucao)) &&
    (devolucao.justificativa == null || typeof devolucao.justificativa === 'string');
}

@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly api = inject(ApiService);
  // Mantido apenas em memória para reabrir o formulário após uma resposta incerta.
  readonly cadastroPendente = signal<{ conteudo: CriarEvento; chave: string } | null>(null);

  listar(periodo: PeriodoEventos) {
    return this.api.get<EventosResponse>('/Eventos', { params: { ...periodo } });
  }
  listarMeusEventos() {
    return this.api.get<MeusEventosResponse>('/Me/Eventos').pipe(map(resposta => {
      if (!Array.isArray(resposta?.items) || !resposta.items.every(resumoPessoalValido)) {
        throw new Error('Resposta inválida ao consultar meus eventos.');
      }
      return resposta;
    }));
  }
  obterMeuEvento(id: string) {
    return this.api.get<EventoParticipante>(`/Me/Eventos/${encodeURIComponent(id)}`).pipe(map(evento => {
      if (!resumoPessoalValido(evento) || evento.id !== id || !Number.isFinite(evento.valorPorMembro) ||
          (evento.descricao != null && typeof evento.descricao !== 'string') ||
          (evento.minhaCobranca !== null && !lancamentoPessoalValido(evento.minhaCobranca)) ||
          (evento.minhasDevolucoes != null &&
            (!Array.isArray(evento.minhasDevolucoes) || !evento.minhasDevolucoes.every(devolucaoValida)))) {
        throw new Error('Resposta inválida ao consultar a situação financeira.');
      }
      return evento;
    }));
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
