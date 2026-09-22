import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/services/api';
import {
  Lancamento,
  LancamentoGeralResponse,
  LancamentosFilters,
  LancamentosResponse,
  RegistrarLancamentoInput,
  UpdateLancamentoInput,
} from '../models/lancamento.model';

@Injectable({
  providedIn: 'root',
})
export class LancamentosService {
  private readonly api = inject(ApiService);

  list(filters: LancamentosFilters = {}): Observable<LancamentosResponse> {
    const params = new HttpParams({
      fromObject: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 10,
        ...(filters.search ? { search: filters.search } : {}),
        ...(filters.status && filters.status !== 'Todos' ? { status: filters.status } : {}),
        ...(filters.finalidade && filters.finalidade !== 'Todos' ? { finalidade: filters.finalidade } : {}),
        ...(filters.vencimento ? { vencimento: filters.vencimento } : {}),
      },
    });

    return this.api.get<LancamentosResponse>('/Lancamentos', { params });
  }

  getById(id: string): Observable<Lancamento> {
    return this.api.get<Lancamento>(`/Lancamentos/${id}`);
  }

  /**
   * Individual: 201 com o Lancamento. Para todos os membros (`aplicarATodosOsMembros`) a API exige
   * `Idempotency-Key` e responde 200 com o resumo da operação; repetir a mesma chave não duplica.
   */
  registrar(
    payload: RegistrarLancamentoInput,
    idempotencyKey?: string,
  ): Observable<Lancamento | LancamentoGeralResponse> {
    return this.api.post<Lancamento | LancamentoGeralResponse>('/Lancamentos/Registrar', payload, {
      headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    });
  }

  update(id: string, payload: UpdateLancamentoInput): Observable<Lancamento> {
    return this.api.put<Lancamento>(`/Lancamentos/${id}`, payload);
  }

  /** A API exige o motivo no corpo do DELETE (auditoria). */
  remove(id: string, motivo: string): Observable<void> {
    return this.api.delete<void>(`/Lancamentos/${id}`, { body: { motivo } });
  }
}
