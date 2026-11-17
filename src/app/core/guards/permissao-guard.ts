import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, of, switchMap } from 'rxjs';

import { AuthService } from '../services/auth';
import { PermissoesService } from '../services/permissoes';
import { ToastService } from '../services/toast.service';

export const permissaoGuard: CanActivateFn = route => {
  const auth = inject(AuthService);
  const permissoes = inject(PermissoesService);
  const router = inject(Router);
  const toast = inject(ToastService);
  const sessaoExistente = auth.isLoggedIn();
  const chaves: string[] = route.data['permissoes'] ?? [route.data['permissao']];

  const exigidas: string[] = route.data['exige'] ?? [];

  return auth.validateSession().pipe(
    switchMap(valida => {
      if (!valida) {
        return of(router.createUrlTree(['/login']));
      }

      const verificar = (validado: boolean) => {
        if (!auth.isLoggedIn()) return router.createUrlTree(['/login']);

        if (!validado) {
          toast.error('Não foi possível validar suas permissões. Tente acessar a página novamente.');
        } else if (chaves.some(chave => permissoes.tem(chave)) &&
                   exigidas.every(chave => permissoes.tem(chave))) {
          return true;
        }

        return router.createUrlTree(['/perfil']);
      };

      // A restauração de sessão já consulta as permissões ao carregar o perfil.
      return sessaoExistente
        ? permissoes.atualizar().pipe(map(resultado => verificar(resultado.tipo === 'validado')))
        : of(verificar(permissoes.carregadas()));
    }),
  );
};
