import { HttpErrorResponse } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import pt from '@angular/common/locales/pt';
import { EventInput } from '@fullcalendar/core';
import { EventoDto, PeriodoEventos } from '../../core/models/evento.model';

registerLocaleData(pt, 'pt-BR');

export function dataCivil(data: Date): string {
  return `${String(data.getFullYear()).padStart(4, '0')}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}
export function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const resultado = new Date(0);
  resultado.setHours(12);
  resultado.setFullYear(ano, mes - 1, dia + dias);
  return dataCivil(resultado);
}
export function periodoInclusivo(inicio: Date, fimExclusivo: Date): PeriodoEventos {
  return { dataInicial: dataCivil(inicio), dataFinal: somarDias(dataCivil(fimExclusivo), -1) };
}
export function formatarData(data: string, curta = false): string {
  const [ano, mes, dia] = data.split('-').map(Number);
  const valor = new Date(0);
  valor.setHours(12);
  valor.setFullYear(ano, mes - 1, dia);
  return new Intl.DateTimeFormat('pt-BR', curta
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'long', year: 'numeric' }).format(valor);
}
export function rotuloData(data: string, hoje = dataCivil(new Date())): string {
  return data === hoje ? 'Hoje' : data === somarDias(hoje, 1) ? 'Amanhã' : formatarData(data, true);
}
export function nomeEvento(evento: EventoDto): string {
  return evento.titulo?.trim() || `Evento — ${evento.local}`;
}
export function corEvento(evento: EventoDto): string {
  const hash = [...(evento.eventoGrupoId || evento.id)].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 0);
  return ['roxo', 'azul', 'verde', 'laranja'][Math.abs(hash) % 4];
}
export function grupoEvento(evento: EventoDto, eventos: EventoDto[]): string {
  const grupo = eventos.filter(e => e.eventoGrupoId === evento.eventoGrupoId).sort((a, b) => a.id.localeCompare(b.id));
  return grupo.length > 1 ? `Grupo ${grupo.findIndex(e => e.id === evento.id) + 1} de ${grupo.length}` : '';
}
export function mapearEventos(eventos: EventoDto[]): EventInput[] {
  return eventos.map(evento => ({
    id: evento.id, title: nomeEvento(evento), start: evento.dataEvento, allDay: true,
    classNames: [`evento-${corEvento(evento)}`],
    extendedProps: { participantes: evento.quantidadeMembros, grupo: grupoEvento(evento, eventos) },
  }));
}
export function custosBloqueados(evento: EventoDto | null): boolean {
  return !!evento?.lancamentos.some(l => l.status !== 'Pendente');
}
export function erroEvento(erro: unknown): string {
  if (erro instanceof Error && erro.name === 'TimeoutError') return 'O servidor demorou para responder. A operação não foi confirmada; tente novamente.';
  if (!(erro instanceof HttpErrorResponse)) return 'Não foi possível concluir a operação. Tente novamente.';
  if (erro.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (erro.status === 403) return 'Você não tem permissão para esta operação.';
  const problema = erro.error;
  const detalhes = typeof problema?.detail === 'string' ? problema.detail : '';
  const validacoes = problema?.errors && typeof problema.errors === 'object'
    ? Object.values(problema.errors).flat().filter(v => typeof v === 'string').join(' ') : '';
  const titulo = typeof problema?.title === 'string' ? problema.title : '';
  if (detalhes || validacoes) return [detalhes, validacoes].filter(Boolean).join(' ');
  if (erro.status === 404) return titulo || 'Evento não encontrado ou já excluído.';
  if (erro.status === 409) return titulo || 'O evento foi alterado ou a operação está bloqueada. Recarregue os dados antes de continuar.';
  if (erro.status === 400) return titulo || 'Confira os dados informados.';
  if (erro.status === 0) return 'Não foi possível confirmar a operação. Verifique sua conexão e tente novamente.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}
