import { Component, computed, inject, model } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { PermissoesService } from '../../../core/services/permissoes';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  permissoes?: string[];
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
  private readonly permissoes = inject(PermissoesService);

  readonly expanded = model(true);

  // Somente destinos com página. Novos itens (Atividades, Relatórios…) entram aqui quando existirem;
  // a barra inferior do celular comporta até 5.
  private readonly todosOsItens: MenuItem[] = [
    {
      label: 'Dashboard',
      icon: 'dashboard',
      route: '/dashboard',
      permissoes: ['dashboard.consultar'],
    },
    {
      label: 'Desbravadores',
      icon: 'users',
      route: '/desbravadores',
      permissoes: ['usuarios.consultar', 'membros.consultar'],
      badge: 0,
    },
    {
      label: 'Tesouraria',
      icon: 'wallet',
      route: '/treasury',
      permissoes: ['financeiro.tesouraria.consultar', 'financeiro.lancamentos.consultar'],
    },
    {
      label: 'Eventos',
      icon: 'clipboard',
      route: '/eventos',
    },
    {
      label: 'Cargos e permissões',
      icon: 'settings',
      route: '/admin/cargos',
      permissoes: ['autorizacao.consultar'],
    },
  ];

  readonly menuItems = computed(() =>
    this.todosOsItens.filter(item => !item.permissoes || item.permissoes.some(chave => this.permissoes.tem(chave))),
  );

  toggleSidebar() {
    this.expanded.update(value => !value);
  }
}
