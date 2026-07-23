import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { signal } from '@angular/core';

interface MenuItem {
  label: string;
  icon: string;
  route: string;
  badge?: number;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule ],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
})
export class SidebarComponent implements OnInit {
  private router = inject(Router);
  
  isExpanded = signal(true);
  
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

  ngOnInit() {
    // Você pode obter os itens do menu de um serviço se necessário
  }

  toggleSidebar() {
    this.isExpanded.update(value => !value);
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  isActive(route: string): boolean {
    return this.router.url.includes(route);
  }
}
