import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { AuthService } from '../services/auth';
import { PermissoesService } from '../services/permissoes';

export const permissaoGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const permissoes = inject(PermissoesService);
  const router = inject(Router);
  const sessaoExistente = auth.isLoggedIn();
  const chaves: string[] = route.data['permissoes'] ?? [route.data['permissao']];

  const exigidas: string[] = route.data['exige'] ?? [];

  return auth.validateSession().pipe(
    switchMap(valida => {
      if (!valida) {
        return of(router.createUrlTree(['/login']));
      }

      const verificar = () => (chaves.some(chave => permissoes.tem(chave)) &&
        exigidas.every(chave => permissoes.tem(chave))) ||
        router.createUrlTree(['/perfil']);
      return sessaoExistente ? permissoes.atualizar().pipe(map(verificar)) : of(verificar());
    }),
  );
};
