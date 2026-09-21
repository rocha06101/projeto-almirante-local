import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { isApiUrl } from '../config/api-base';
import { AuthService } from '../services/auth';
import { SKIP_AUTH } from './auth-context';

const AUTH_ENDPOINT = /\/Auth\/(login|refresh|logout|csrf)\/?$/i;

/**
 * Aplica credenciais somente à API legítima:
 *  - `withCredentials` (cookies `__Host-*` de CSRF/refresh);
 *  - `Authorization: Bearer` com o access token em memória.
 * Um `401` de endpoint de negócio provoca uma única renovação e uma única repetição
 * (a API não executou a operação); se a renovação falhar, a sessão é encerrada.
 * `403` não encerra a sessão: é falta de permissão.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiUrl(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const base = req.clone({ withCredentials: true });
  const token = req.context.get(SKIP_AUTH) ? null : auth.accessToken();

  return next(token ? withBearer(base, token) : base).pipe(
    catchError((error: unknown) => {
      const unauthorized = error instanceof HttpErrorResponse && error.status === 401;

      if (!unauthorized || !token || AUTH_ENDPOINT.test(req.url)) {
        return throwError(() => error);
      }

      return auth.refreshSession().pipe(
        switchMap(fresh => next(withBearer(base, fresh))),
        catchError((retryError: unknown) => {
          // Só encerra a sessão quando a API a recusou (401); falha de rede/5xx mantém a sessão.
          if (!(retryError instanceof HttpErrorResponse) || retryError.status === 401) {
            auth.expireSession();
          }
          return throwError(() => retryError);
        }),
      );
    }),
  );
};

function withBearer(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
