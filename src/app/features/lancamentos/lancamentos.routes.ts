import { Routes } from '@angular/router';

export const lancamentosRoutes: Routes = [
  {
    path: 'lancamentos',
    loadComponent: () =>
      import('../../shared/components/financial-entries-component/financial-entries-component').then(
        component => component.FinancialEntriesComponent,
      ),
  },
];
