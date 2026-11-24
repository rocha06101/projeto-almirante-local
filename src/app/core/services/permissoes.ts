import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, defaultIfEmpty, finalize, map, of, shareReplay, takeUntil, tap, throwError } from 'rxjs';

import { MinhasPermissoes } from '../models/permissoes.model';
import { ApiService } from './api';

const CARGOS_COM_ACESSO_A_SECRETARIA = new Set(['ADM', 'DIR', 'DIRA', 'SEC']);

type ResultadoAtualizacao =
  | { tipo: 'validado'; permissoes: MinhasPermissoes }
  | { tipo: 'falha'; erro: unknown }
  | { tipo: 'cancelado' };

@Injectable({
  providedIn: 'root',
})
export class PermissoesService {
  private readonly api = inject(ApiService);

  private readonly estado = signal<MinhasPermissoes | null>(null);

  readonly cargo = computed(() => this.estado()?.cargo ?? null);

  readonly carregadas = computed(() => this.estado() !== null);

  readonly versaoAutorizacao = computed(
    () => this.estado()?.versaoAutorizacao ?? null,
  );

  private readonly chaves = computed(
    () => new Set(this.estado()?.permissoes ?? []),
  );

  private readonly sessaoEncerrada = new Subject<void>();
  private carregamento?: Observable<MinhasPermissoes>;

  atualizar(): Observable<ResultadoAtualizacao> {
    return this.carregar().pipe(
      map((permissoes): ResultadoAtualizacao => ({ tipo: 'validado', permissoes })),
      catchError((erro: unknown) => of({ tipo: 'falha', erro } as const)),
      defaultIfEmpty({ tipo: 'cancelado' } as const),
    );
  }

  carregar(): Observable<MinhasPermissoes> {
    return this.carregamento ??= this.api.get<MinhasPermissoes>('/Me/Permissoes').pipe(
      takeUntil(this.sessaoEncerrada),
      tap(resposta => this.estado.set(resposta)),
      catchError((erro: unknown) => {
        this.estado.set(null);
        return throwError(() => erro);
      }),
      finalize(() => this.carregamento = undefined),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  tem(permissao: string): boolean {
    if (this.chaves().has(permissao)) return true;

    // O backend atual ainda não publica secretaria.consultar. O cargo validado
    // pela API libera somente a página, sem conceder permissões de listagem ou escrita.
    const role = this.cargo()?.role;
    return permissao === 'secretaria.consultar' && !!role && CARGOS_COM_ACESSO_A_SECRETARIA.has(role);
  }

  limpar(): void {
    this.sessaoEncerrada.next();
    this.estado.set(null);
  }
}
