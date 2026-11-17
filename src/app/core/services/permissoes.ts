import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, catchError, defaultIfEmpty, finalize, of, shareReplay, takeUntil, tap, throwError } from 'rxjs';

import { MinhasPermissoes } from '../models/permissoes.model';
import { ApiService } from './api';

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

  atualizar(): Observable<MinhasPermissoes | null> {
    return this.carregar().pipe(catchError(() => of(null)), defaultIfEmpty(null));
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
    return this.chaves().has(permissao);
  }

  limpar(): void {
    this.sessaoEncerrada.next();
    this.estado.set(null);
  }
}
