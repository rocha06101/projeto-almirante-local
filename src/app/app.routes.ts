import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth-guard';
import { LayoutComponent } from './shared/layouts/layout/layout';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
     import('./pages/login/login')
    .then(m => m.Login)
  },

  {
    path: 'register',
    loadComponent: () =>
      import('./pages/register/register')
      .then(m => m.Register),
  },
  
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/home/home')
        .then(m => m.Home),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/home/home')
        .then(m => m.Home),
      },
      {
        path: 'desbravadores',
        loadComponent: () =>
          import('./pages/desbravadores/desbravadores')
        .then(m => m.Desbravadores),
      },
      {
        path: 'desbravadores/cadastrar',
        loadComponent: () =>
          import('./pages/desbravadores/user-register/user-register')
          .then(m => m.UserRegister),
      },
    ]
  },
  
  {
    path: '**',
    redirectTo: ''
  }  
];
