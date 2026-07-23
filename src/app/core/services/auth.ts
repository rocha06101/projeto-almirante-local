import { Injectable, signal, inject } from '@angular/core';
import { catchError, map, Observable, of, tap } from 'rxjs';
import { ApiService } from './api';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly TOKEN_KEY = 'auth_token';
  private api = inject(ApiService);

  isLoggedIn = signal<boolean>(this.hasToken());

  login(email: string, password: string): Observable<any> {
    return this.api.post<any>(
      '/Auth/login',
      { email, senha: password }
    ).pipe(
      tap(response => {
        const token = response?.token?.accessToken ?? response?.token;

        if (token) {
          localStorage.setItem(this.TOKEN_KEY, token);
        }

        this.isLoggedIn.set(true);
      })
    );
  }

  logout(): Observable<void> {
    return this.api.post<void>('/Auth/logout', {}).pipe(
      tap(() => {
        localStorage.removeItem(this.TOKEN_KEY);
        this.isLoggedIn.set(false);
      }),
      catchError(() => {
        // Even if logout request fails, remove token locally
        localStorage.removeItem(this.TOKEN_KEY);
        this.isLoggedIn.set(false);
        return of(void 0);
      })
    );
  }

  validateSession(): Observable<boolean> {
    if (!this.hasToken()) {
      return this.logout().pipe(map(() => false));
    }

    return this.api.get<any>('/Auth/Me').pipe(
      map(() => {
        this.isLoggedIn.set(true);
        return true;
      }),
      catchError(() => {
        return this.logout().pipe(map(() => false));
      })
    );
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.TOKEN_KEY);
  }
}
