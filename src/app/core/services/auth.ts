import { Injectable, inject } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import {
  Observable,
  catchError,
  defer,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { ApiService } from './api';
import { TokenStore } from './token-store';
import { CsrfResponse, LoginRequest, LoginResponse, UsuarioLogado } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenStore = inject(TokenStore);
  private refreshInFlight$: Observable<LoginResponse> | null = null;

  getCsrfToken(includeAuthorization = false): Observable<string> {
  const token = this.tokenStore.getToken();

  const headers = includeAuthorization && token
    ? new HttpHeaders({
        Authorization: `Bearer ${token}`,
      })
    : undefined;

  return this.api
    .get<CsrfResponse>('/Auth/csrf', {
      withCredentials: true,
      ...(headers ? { headers } : {}),
    })
    .pipe(
      map((response) => response.csrfToken)
    );
}

  login(email: string, password: string): Observable<LoginResponse> {
  const body: LoginRequest = {
    email,
    senha: password,
  };

  return this.getCsrfToken().pipe(
    switchMap((csrfToken) => {
      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': csrfToken,
      });

      return this.api.post<LoginResponse>('/Auth/login', body, {
        withCredentials: true,
        headers,
      });
    }),
    tap((response) => {
      this.tokenStore.setToken(
        response.token.accessToken,
        response.token.expiresAtUtc
      );
    }),
    switchMap((response) =>
      this.me().pipe(
        map(() => response)
      )
    ),
    catchError((error) => {
      this.tokenStore.clear();
      return throwError(() => error);
    })
  );
}

  me(): Observable<UsuarioLogado> {
    const token = this.tokenStore.getToken();
    if (!token) return throwError(() => new Error('No access token available'));

    const headers = new HttpHeaders({
      Authorization: 'Bearer ' + token,
    });

    return this.api.get<UsuarioLogado>('/Auth/Me', {
      headers,
      withCredentials: true,
    });
  }

refresh(): Observable<LoginResponse> {
  if (this.refreshInFlight$) {
    return this.refreshInFlight$;
  }

  this.refreshInFlight$ = defer(() =>
    this.getCsrfToken().pipe(
      switchMap((csrfToken) => {
        const headers = new HttpHeaders({
          'X-CSRF-TOKEN': csrfToken,
        });

        return this.api.post<LoginResponse>('/Auth/refresh', {}, {
          withCredentials: true,
          headers,
        });
      }),
      tap((response) => {
        this.tokenStore.setToken(
          response.token.accessToken,
          response.token.expiresAtUtc
        );
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      })
    )
  ).pipe(
    shareReplay({
      bufferSize: 1,
      refCount: false,
    })
  );

  return this.refreshInFlight$;
}

  restoreSession(): Observable<boolean> {
    return this.refresh().pipe(
      switchMap(() => this.me()),
      map(() => true),
      catchError(() => {
        this.tokenStore.clear();
        return of(false);
      })
    );
  }

  validateSession(): Observable<boolean> {
    if (!this.tokenStore.getToken()) return of(false);

    return this.me().pipe(
      map(() => true),
      catchError(() => {
        this.tokenStore.clear();
        return of(false);
      })
    );
  }

  logout(): Observable<void> {
  const token = this.tokenStore.getToken();

  const logoutWithCsrf = (csrfToken: string, accessToken?: string) => {
    const headers = new HttpHeaders({
      'X-CSRF-TOKEN': csrfToken,
      ...(accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : {}),
    });

    return this.api.post<void>('/Auth/logout', {}, {
      withCredentials: true,
      headers,
    });
  };

  const logoutRequest$ = token
    ? this.getCsrfToken(true).pipe(
        switchMap((csrfToken) =>
          logoutWithCsrf(csrfToken, token)
        ),
        catchError((error) => {
          if (error.status !== 401) {
            return throwError(() => error);
          }

          return this.getCsrfToken().pipe(
            switchMap((csrfToken) =>
              logoutWithCsrf(csrfToken)
            )
          );
        })
      )
    : this.getCsrfToken().pipe(
        switchMap((csrfToken) =>
          logoutWithCsrf(csrfToken)
        )
      );

  return logoutRequest$.pipe(
    map(() => void 0),
    finalize(() => {
      this.tokenStore.clear();
    })
  );
}
}
