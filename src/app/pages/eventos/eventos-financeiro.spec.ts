import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { EventoDto } from '../../core/models/evento.model';
import { erroEvento, liquidacaoConfirmavel, motivoValido, podeRemoverMembro, respostaIncerta } from './eventos.utils';

const evento: EventoDto = {
  id: 'e1', eventoGrupoId: 'g1', eventoReferenciaId: null, dataEvento: '2026-11-19', local: 'Sede',
  membros: ['m1', 'm2'], quantidadeMembros: 2, transporte: { ehGratis: true, valor: 0 }, alimentacao: { individual: true, valor: 0 },
  seguroObrigatorio: 50, valorPorMembro: 50, total: 100, versao: 'opaca', ativo: true,
  lancamentos: [{ id: 'l1', membroId: 'm1', valor: 50, status: 'Pago' }, { id: 'l2', membroId: 'm2', valor: 50, status: 'Atrasado' }],
  devolucoes: [],
};
describe('Regras de apresentação do contrato #209', () => {
  it('só bloqueia remoção antecipada do próprio pagante; no dia ou depois preserva decisão do servidor', () => {
    expect(podeRemoverMembro(evento, 'm1', '2026-11-18')).toBe(false);
    expect(podeRemoverMembro(evento, 'm2', '2026-11-18')).toBe(true);
    expect(podeRemoverMembro(evento, 'm1', '2026-11-19')).toBe(true);
    expect(podeRemoverMembro(evento, 'm1', '2026-11-20')).toBe(true);
  });
  it('devolução pendente bloqueia; baixa não comprova valor retido sem ValorPago (inclusive pagamento parcial)', () => {
    const e = structuredClone(evento);
    e.devolucoes = [{ id: 'd1', membroId: 'm1', lancamentoOrigemId: 'l1', valor: 20, vencimento: '2026-11-18',
      status: 'Pendente', valorDevolvido: null, dataDevolucao: null, motivo: 'Estorno', justificativa: null }];
    expect(liquidacaoConfirmavel(e)).toBe(false);
    expect(podeRemoverMembro(e, 'm1', '2026-11-18')).toBe(false);
    e.devolucoes[0] = { ...e.devolucoes[0], status: 'Pago', valorDevolvido: 15, dataDevolucao: '2026-11-18', justificativa: 'Acordo' };
    expect(liquidacaoConfirmavel(e)).toBeNull();
    expect(podeRemoverMembro(e, 'm1', '2026-11-18')).toBe(true);
    expect(e.lancamentos[0].valor).toBe(50);
  });
  it('atraso sem pagamento não bloqueia exclusão', () => {
    expect(liquidacaoConfirmavel({ ...evento, lancamentos: [evento.lancamentos[1]] })).toBe(true);
  });
  it('valida motivo trimado em CP1252 e limita controles/caracteres', () => {
    expect(motivoValido('  Patrocínio — R$ 20,00  ')).toBe(true);
    expect(motivoValido('a')).toBe(true);
    for (const valor of ['', ' ', '😀', 'a\nb', 'a\tb', 'x'.repeat(256)]) expect(motivoValido(valor)).toBe(false);
  });
  it('timeout e 5xx são resultados incertos; rejeições explícitas não são', () => {
    expect(respostaIncerta(new TimeoutError())).toBe(true);
    expect(erroEvento(new TimeoutError())).toContain('Consulte os dados atuais');
    for (const status of [0, 500, 502, 503]) expect(respostaIncerta(new HttpErrorResponse({ status }))).toBe(true);
    for (const status of [400, 401, 403, 404, 409]) expect(respostaIncerta(new HttpErrorResponse({ status }))).toBe(false);
  });
});
