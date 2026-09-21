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
      label: 'Atividades',
      icon: 'clipboard',
      route: '/atividades',
    },
    {
      label: 'Relatórios',
      icon: 'chart',
      route: '/relatorios',
    },
    {
      label: 'Configurações',
      icon: 'settings',
      route: '/configuracoes',
    },
  ]);

  toggleSidebar() {
    this.expanded.update(value => !value);
  }
}
