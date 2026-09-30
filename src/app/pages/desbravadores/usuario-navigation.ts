import { Router } from '@angular/router';
import { User as UserModel } from '../../core/models/user.model';

/** Estado de navegação usado para abrir a edição e para o feedback na listagem (o id não vai para a URL). */
export interface UsuarioNavigationState {
  usuario?: UserModel;
  feedback?: string;
}

/** Estado da navegação em curso (inclusive recarga/voltar); sem navegação, o do histórico. */
export function readNavigationState(router: Router): UsuarioNavigationState {
  const navigation = router.currentNavigation();
  const state = navigation ? navigation.extras.state : typeof history !== 'undefined' ? history.state : null;
  return (state as UsuarioNavigationState | null | undefined) ?? {};
}
