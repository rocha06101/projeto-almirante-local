import { HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  defer,
  finalize,
  firstValueFrom,
  from,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { SKIP_AUTH } from '../interceptors/auth-context';
import { CurrentUser } from '../models/user.model';
import { ApiService } from './api';

interface TokenResponse {
  token: { accessToken: string; expiresAtUtc: string };
}

interface CsrfResponse {
  csrfToken: string;
}

/** Chave usada por versões anteriores para guardar o token; removida por segurança. */
const LEGACY_TOKEN_KEY = 'auth_token';
const CSRF_HEADER = 'X-CSRF-TOKEN';
const REFRESH_LOCK = 'almirante-auth-refresh';
/** Margem para renovar o access token antes de expirar. */
const EXPIRY_SKEW_MS = 30_000;

/**
 * Sessão da SPA conforme o contrato do backend:
 *  - o access token vive somente em memória (nunca em Web Storage);
 *  - o refresh token é um cookie `__Host-` HttpOnly, invisível ao JavaScript;
 *  - login/refresh/logout exigem `X-CSRF-TOKEN`, obtido em `GET /Auth/csrf`.
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private token: string | null = null;
  private tokenExpiresAt = 0;
  private refreshing$?: Observable<string>;

  readonly isLoggedIn = signal(false);
  readonly user = signal<CurrentUser | null>(null);

  constructor() {
    try {
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch {
      // Web Storage indisponível (modo privado, SSR): nada a limpar.
    }
  }

  accessToken(): string | null {
    return this.token;
  }

  login(email: string, password: string): Observable<CurrentUser> {
    return this.csrfToken(false).pipe(
      switchMap(csrf =>
        this.api.post<TokenResponse>(
          '/Auth/login',
          { email, senha: password },
          { headers: { [CSRF_HEADER]: csrf }, context: this.skipAuth() },
        ),
      ),
      tap(response => this.storeToken(response)),
      switchMap(() => this.loadProfile()),
    );
  }

  /** Renova o access token via cookie de refresh. Uma única renovação por vez (abas incluídas). */
  refreshSession(): Observable<string> {
    this.refreshing$ ??= defer(() =>
      from(this.exclusive(() => firstValueFrom(this.requestRefresh()))),
    ).pipe(
      finalize(() => (this.refreshing$ = undefined)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.refreshing$;
  }

  /** Garante uma sessão utilizável: usa o token em memória ou tenta restaurar pelo cookie de refresh. */
  validateSession(): Observable<boolean> {
    if (this.hasFreshToken() && this.user()) {
      return of(true);
    }

    const restore$ = this.hasFreshToken() ? of(this.token as string) : this.refreshSession();

    return restore$.pipe(
      switchMap(() => this.loadProfile()),
      map(() => true),
      catchError(() => {
        this.clearSession();
        return of(false);
      }),
    );
  }

  logout(): Observable<void> {
    const authenticated = !!this.token;

    return this.csrfToken(authenticated).pipe(
      switchMap(csrf =>
        this.api.post<void>(
          '/Auth/logout',
          {},
          { headers: { [CSRF_HEADER]: csrf }, context: authenticated ? undefined : this.skipAuth() },
        ),
      ),
      map(() => void 0),
      catchError(() => of(void 0)),
      finalize(() => this.clearSession()),
    );
  }

  /** Descarta a sessão local (ex.: refresh recusado) e leva o usuário ao login. */
  expireSession(): void {
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  private clearSession(): void {
    this.token = null;
    this.tokenExpiresAt = 0;
    this.user.set(null);
    this.isLoggedIn.set(false);
  }

  private loadProfile(): Observable<CurrentUser> {
    return this.api.get<CurrentUser>('/Auth/Me').pipe(
      tap(user => {
        this.user.set(user);
        this.isLoggedIn.set(true);
      }),
    );
  }

  private requestRefresh(): Observable<string> {
    return this.csrfToken(false).pipe(
      switchMap(csrf =>
        this.api.post<TokenResponse>(
          '/Auth/refresh',
          {},
          { headers: { [CSRF_HEADER]: csrf }, context: this.skipAuth() },
        ),
      ),
      map(response => this.storeToken(response)),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401) {
          this.clearSession();
        }
        return throwError(() => error);
      }),
    );
  }

  /**
   * O antiforgery da API vincula o token ao usuário autenticado no momento da emissão:
   * quando a chamada seguinte leva Bearer, o CSRF também precisa ser pedido com Bearer.
   */
  private csrfToken(withBearer: boolean): Observable<string> {
    return this.api
      .get<CsrfResponse>('/Auth/csrf', { context: withBearer ? undefined : this.skipAuth() })
      .pipe(map(response => response.csrfToken));
  }

  private storeToken(response: TokenResponse): string {
    const { accessToken, expiresAtUtc } = response.token;
    this.token = accessToken;
    this.tokenExpiresAt = parseUtc(expiresAtUtc);
    return accessToken;
  }

  private hasFreshToken(): boolean {
    return !!this.token && this.tokenExpiresAt - EXPIRY_SKEW_MS > Date.now();
  }

  private skipAuth(): HttpContext {
    return new HttpContext().set(SKIP_AUTH, true);
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const locks = globalThis.navigator?.locks;
    // request() resolve com o valor da promessa devolvida pelo callback.
    return locks ? (locks.request(REFRESH_LOCK, () => task()) as Promise<T>) : task();
  }
}

/** A API serializa `expiresAtUtc` em UTC; garante interpretação UTC mesmo sem o sufixo `Z`. */
function parseUtc(value: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}
