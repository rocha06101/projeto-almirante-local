import { HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '../../../core/services/api';
import {
  CreateLancamentoInput,
  Lancamento,
  LancamentosFilters,
  LancamentosResponse,
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
        ...(filters.tipo && filters.tipo !== 'Todos' ? { tipo: filters.tipo } : {}),
        ...(filters.data ? { data: filters.data } : {}),
      },
    });

    return this.api.get<LancamentosResponse>('/Lancamentos', { params });
  }

  create(payload: CreateLancamentoInput): Observable<Lancamento> {
    return this.api.post<Lancamento>('/Lancamentos', payload);
  }

  update(id: string, payload: Partial<CreateLancamentoInput>): Observable<Lancamento> {
    return this.api.put<Lancamento>(`/Lancamentos/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.api.delete<void>(`/Lancamentos/${id}`);
  }
}
