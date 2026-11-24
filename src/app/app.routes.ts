import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { LayoutComponent } from './shared/layouts/layout/layout';
import { permissaoGuard } from './core/guards/permissao-guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login')
        .then(m => m.Login)
  },

  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [permissaoGuard],
        data: { permissao: 'dashboard.consultar' },
        loadComponent: () =>
          import('./pages/home/home')
            .then(m => m.Home),
      },
      {
        path: 'dashboard',
        canActivate: [permissaoGuard],
        data: { permissao: 'dashboard.consultar' },
        loadComponent: () =>
          import('./pages/home/home')
            .then(m => m.Home),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./pages/my-profile/my-profile')
            .then(m => m.MyProfile),
      },
      {
        path: 'preferencias',
        loadComponent: () =>
          import('./pages/preferences/preferences')
            .then(m => m.Preferences),
      },
      {
        path: 'desbravadores',
        canActivate: [permissaoGuard],
        data: { permissoes: ['usuarios.consultar', 'membros.consultar'] },
        loadComponent: () =>
          import('./pages/desbravadores/desbravadores')
            .then(m => m.Desbravadores),
      },
      {
        path: 'desbravadores/cadastrar',
        canActivate: [permissaoGuard],
        data: { permissao: 'usuarios.criar', exige: ['cargos.consultar'] },
        loadComponent: () =>
          import('./pages/desbravadores/user-register/user-register')
            .then(m => m.UserRegister),
      },
      {
        // O id do usuário não vai para a URL.
        path: 'desbravadores/editar',
        canActivate: [permissaoGuard],
        data: {
          modo: 'editar',
          permissao: 'usuarios.editar',
          exige: ['usuarios.consultar', 'cargos.consultar'],
        },
        loadComponent: () =>
          import('./pages/desbravadores/user-edit/user-edit')
            .then(m => m.UserEdit),
      },
      {
        path: 'admin/cargos',
        canActivate: [permissaoGuard],
        data: { permissao: 'autorizacao.consultar' },
        loadComponent: () => import('./pages/admin/cargos/cargos').then(m => m.Cargos),
      },
      {
        path: 'secretaria',
        canActivate: [permissaoGuard],
        data: { permissao: 'secretaria.consultar' },
        loadComponent: () => import('./pages/secretaria/secretaria').then(m => m.Secretaria),
      },
      {
        path: 'eventos',
        loadComponent: () => import('./pages/eventos/eventos').then(m => m.Eventos),
      },
      {
        path: 'treasury',
        canActivate: [permissaoGuard],
        data: { permissoes: ['financeiro.tesouraria.consultar', 'financeiro.lancamentos.consultar'] },
        loadComponent: () =>
          import('./pages/treasury/treasury')
            .then(m => m.Treasury),
      },
      {
        path: 'lancamentos',
        redirectTo: '/treasury',
        pathMatch: 'full',
      },
    ]
  },

  {
    path: '**',
    redirectTo: ''
  }
];
