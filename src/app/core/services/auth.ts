import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, catchError, map, of, tap } from 'rxjs';
import { ApiService } from './api';
import {
  CsrfResponse,
  LoginRequest,
  LoginResponse,
  UsuarioLogado,
} from '../models/auth.model';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly TOKEN_KEY = 'auth_token';

  getCsrfToken(): Observable<string> {
    return this.api
      .get<CsrfResponse>('/Auth/csrf', { withCredentials: true })
      .pipe(map((response) => response.csrfToken));
  }

  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = {
      email,
      senha: password,
    };

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
    });

    return this.http
      .post<LoginResponse>('/api/Auth/login', body, {
        withCredentials: true,
        headers,
      })
      .pipe(
        tap((response) => {
          const token = response?.token?.accessToken ?? response?.token;

          if (token) {
            localStorage.setItem(this.TOKEN_KEY, String(token));
          }
        })
      );
  }

  me(): Observable<UsuarioLogado> {
    const token = localStorage.getItem(this.TOKEN_KEY);

    const headers = new HttpHeaders({
      Authorization: `Bearer ${token ?? ''}`,
    });

    return this.http.get<UsuarioLogado>('/api/Auth/Me', {
      headers,
      withCredentials: true,
    });
  }

  validateSession(): Observable<boolean> {
    return this.me().pipe(
      map(() => true),
      catchError(() => of(false))
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/Auth/logout', {}, {
      withCredentials: true,
    }).pipe(
      tap(() => localStorage.removeItem(this.TOKEN_KEY))
    );
  }
}