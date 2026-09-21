import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { TokenStore } from '../services/token-store';

const AUTH_ENDPOINTS_WITHOUT_BEARER = [
  '/Auth/csrf',
  '/Auth/login',
  '/Auth/refresh',
  '/Auth/logout',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStore = inject(TokenStore);

  if (AUTH_ENDPOINTS_WITHOUT_BEARER.some((endpoint) => req.url.includes(endpoint))) {
    return next(req);
  }

  const token = tokenStore.getToken();

  if (!token || tokenStore.isExpired()) {
    return next(req);
  }

  return next(req.clone({
    setHeaders: {
      Authorization: 'Bearer ' + token,
    },
  }));
};
