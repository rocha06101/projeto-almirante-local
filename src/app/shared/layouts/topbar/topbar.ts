import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class TopbarComponent {
  private router = inject(Router);
  private auth = inject(AuthService);

  @ViewChild('profileWrapper') profileWrapper?: ElementRef<HTMLElement>;
  @ViewChild('notificationWrapper') notificationWrapper?: ElementRef<HTMLElement>;

  searchQuery = signal('');
  profileOpen = signal(false);
  notificationOpen = signal(false);

  notifications = signal([
    { id: 1, message: 'Nova atividade atribuída', type: 'info', timestamp: 'há 5 minutos' },
    { id: 2, message: 'Desbravador registrado com sucesso', type: 'success', timestamp: 'há 1 hora' },
  ]);

  /** Dados do usuário autenticado (vindos de /Auth/Me). */
  userInfo = computed(() => {
    const user = this.auth.user();

    return {
      name: user?.nome ?? 'Usuário',
      role: user?.cargo?.nome ?? '',
      avatar: '/icons/user-icon2.svg',
    };
  });

  onSearch(event: Event) {
    const target = event.target as HTMLInputElement;
    this.searchQuery.set(target.value);
    // Implementar busca aqui
  }

  toggleProfile() {
    this.profileOpen.update(v => !v);
    this.notificationOpen.set(false);
  }

  toggleNotifications() {
    this.notificationOpen.update(v => !v);
    this.profileOpen.set(false);
  }

  /** Fecha o dropdown aberto ao tocar/clicar fora dele. */
  @HostListener('document:click', ['$event'])
  closePopups(event: MouseEvent) {
    const target = event.target as Node;

    if (!this.profileWrapper?.nativeElement.contains(target)) {
      this.profileOpen.set(false);
    }

    if (!this.notificationWrapper?.nativeElement.contains(target)) {
      this.notificationOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closePopupsOnEscape() {
    this.profileOpen.set(false);
    this.notificationOpen.set(false);
  }

  viewProfile() {
    this.router.navigate(['/perfil']);
    this.profileOpen.set(false);
  }

  logout() {
    this.profileOpen.set(false);
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }

  clearNotifications() {
    this.notifications.set([]);
  }
}
