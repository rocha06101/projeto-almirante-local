import { Component, model, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent {
  /** Barra completa (true) ou trilho de ícones (false). O estado pertence ao layout. */
  readonly expanded = model(true);

  // Somente destinos com página. Novos itens (Atividades, Relatórios…) entram aqui quando existirem;
  // a barra inferior do celular comporta até 5.
  menuItems = signal<MenuItem[]>([
    {
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
    },
    {
      label: 'Desbravadores',
      icon: 'users',
      route: '/desbravadores',
      badge: 0,
    },
    {
      label: 'Tesouraria',
      icon: 'wallet',
      route: '/treasury',
    },
    {
      label: 'Lançamentos',
      icon: 'list',
      route: '/lancamentos',
    },
  ]);

  toggleSidebar() {
    this.expanded.update(value => !value);
  }
}
