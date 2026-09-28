import { inject } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { TokenStore } from '../services/token-store';
import { AuthService } from '../services/auth';

const AUTH_ENDPOINTS_WITHOUT_BEARER = [
  '/Auth/csrf',
  '/Auth/login',
  '/Auth/refresh',
  '/Auth/logout',
];

const REFRESH_ATTEMPTED = new HttpContextToken<boolean>(() => false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore);
  const authService = inject(AuthService);
  const router = inject(Router);

  const isAuthEndpoint = AUTH_ENDPOINTS_WITHOUT_BEARER.some((endpoint) =>
    req.url.includes(endpoint)
  );

  if (isAuthEndpoint) {
    return next(req);
  }

  const token = tokenStore.getToken();

  const authReq = token && !tokenStore.isExpired()
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`,
        },
      })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) {
        return throwError(() => error);
      }

      const refreshAlreadyAttempted = req.context.get(REFRESH_ATTEMPTED);

      if (refreshAlreadyAttempted) {
        tokenStore.clear();
        router.navigate(['/login']);

        return throwError(() => error);
      }

      return authService.refresh().pipe(
        switchMap(() => {
          const newToken = tokenStore.getToken();

          if (!newToken) {
            tokenStore.clear();
            router.navigate(['/login']);

            return throwError(() => error);
          }

          const retryReq = req.clone({
            context: req.context.set(REFRESH_ATTEMPTED, true),
            setHeaders: {
              Authorization: `Bearer ${newToken}`,
            },
          });

          return next(retryReq);
        }),
        catchError((refreshError) => {
          tokenStore.clear();
          router.navigate(['/login']);

          return throwError(() => refreshError);
        })
      );
    })
  );
};