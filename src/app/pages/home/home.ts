import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth';
import { SectionsComponent } from '../../shared/components/sections/sections';
import { take } from 'rxjs';
import { signal } from '@angular/core';

interface DashboardCard {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  description?: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, SectionsComponent],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  dashboardCards = signal<DashboardCard[]>([
    {
      title: 'Total de Desbravadores',
      value: 156,
      icon: '👥',
      color: '#3b82f6',
      description: 'Ativos no sistema'
    },
    {
      title: 'Atividades Planejadas',
      value: 12,
      icon: '📋',
      color: '#10b981',
      description: 'Próximas 30 dias'
    },
    {
      title: 'Taxa de Conclusão',
      value: '94%',
      icon: '✅',
      color: '#f59e0b',
      description: 'Atividades concluídas'
    },
    {
      title: 'Notificações Pendentes',
      value: 5,
      icon: '🔔',
      color: '#ef4444',
      description: 'Aguardando ação'
    },
  ]);

  recentActivities = signal([
    { id: 1, title: 'Atividade de Campismo', date: '22/04/2024', status: 'Concluída' },
    { id: 2, title: 'Treinamento de Liderança', date: '21/04/2024', status: 'Em Progresso' },
    { id: 3, title: 'Limpeza Comunitária', date: '20/04/2024', status: 'Concluída' },
  ]);

  ngOnInit() {
    this.authService.validateSession().pipe(take(1)).subscribe(isValid => {
      if (!isValid) {
        this.router.navigate(['/login']);
      }
    });
  }
}
