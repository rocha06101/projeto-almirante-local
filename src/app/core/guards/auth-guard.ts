import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { map } from 'rxjs';
import { AuthService } from '../services/auth';
import { TokenStore } from '../services/token-store';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const tokenStore = inject(TokenStore);
  const router = inject(Router);

  const token = tokenStore.getToken();

  const session$ = token
    ? authService.validateSession()
    : authService.restoreSession();

  return session$.pipe(
    map((isValid) =>
      isValid ? true : router.createUrlTree(['/login'])
    )
  );
};