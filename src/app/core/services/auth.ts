import { Injectable, inject } from '@angular/core';
import { HttpHeaders } from '@angular/common/http';
import { Observable, catchError, finalize, map, of, switchMap, tap, throwError } from 'rxjs';
import { ApiService } from './api';
import { TokenStore } from './token-store';
import { CsrfResponse, LoginRequest, LoginResponse, UsuarioLogado } from '../models/auth.model';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly tokenStore = inject(TokenStore);

  getCsrfToken(): Observable<string> {
    return this.api.get<CsrfResponse>('/Auth/csrf', { withCredentials: true })
      .pipe(map((response) => response.csrfToken));
  }

  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, senha: password };

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
        this.tokenStore.setToken(response.token.accessToken, response.token.expiresAtUtc);
      }),
      switchMap((response) => this.me().pipe(map(() => response))),
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
    return this.getCsrfToken().pipe(
      switchMap((csrfToken) => {
        const headers = new HttpHeaders({ 'X-CSRF-TOKEN': csrfToken });
        return this.api.post<LoginResponse>('/Auth/refresh', {}, {
          withCredentials: true,
          headers,
        });
      }),
      tap((response) => {
        this.tokenStore.setToken(response.token.accessToken, response.token.expiresAtUtc);
      })
    );
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

    if (!token) {
      this.tokenStore.clear();
      return of(void 0);
    }

    return this.getCsrfToken().pipe(
      switchMap((csrfToken) => {
        const headers = new HttpHeaders({
          Authorization: 'Bearer ' + token,
          'X-CSRF-TOKEN': csrfToken,
        });
        return this.api.post<void>('/Auth/logout', {}, {
          withCredentials: true,
          headers,
        });
      }),
      finalize(() => this.tokenStore.clear())
    );
  }
}
