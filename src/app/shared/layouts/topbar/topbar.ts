import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule, DatePipe } from '@angular/common';
import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Notificacao } from '../../../core/models/notificacao.model';
import { AuthService } from '../../../core/services/auth';
import { NotificacoesService } from '../../../core/services/notificacoes';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
  providers: [DatePipe],
})
export class TopbarComponent {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly notificacoesService = inject(NotificacoesService);
  private readonly datePipe = inject(DatePipe);
  private readonly readingIds = new Set<string>();

  @ViewChild('profileWrapper') profileWrapper?: ElementRef<HTMLElement>;
  @ViewChild('notificationWrapper') notificationWrapper?: ElementRef<HTMLElement>;

  searchQuery = signal('');
  profileOpen = signal(false);
  notificationOpen = signal(false);
  notifications = this.notificacoesService.notifications;
  unreadCount = this.notificacoesService.unreadCount;
  isLoading = this.notificacoesService.isLoading;
  isEmpty = this.notificacoesService.isEmpty;
  loadError = this.notificacoesService.loadError;

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
    void this.notificacoesService.stopRealtime();
    this.auth.logout().subscribe(() => this.router.navigate(['/login']));
  }

  clearNotifications() {
    for (const notification of this.notifications()) {
      this.markNotificationAsRead(notification);
    }
  }

  formatNotificationDate(value?: string | null): string {
    if (!value) {
      return 'Data indisponível';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Data indisponível';
    }

    return (
      this.datePipe.transform(date, 'dd/MM/yyyy HH:mm') ??
      new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
    );
  }

  markNotificationAsRead(notification: Notificacao) {
    if (!notification.id || this.readingIds.has(notification.id)) {
      return;
    }

    this.readingIds.add(notification.id);

    this.notificacoesService.marcarComoLida(notification.id).subscribe({
      next: response => {
        this.notificacoesService.confirmarLeitura(
          notification.id,
          response.naoLidas ?? this.unreadCount() - 1,
        );
        this.readingIds.delete(notification.id);
      },
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notificacoesService.removerNotificacaoInexistente(notification.id);
        }

        this.readingIds.delete(notification.id);
      },
    });
  }

  isNotificationReading(id: string): boolean {
    return this.readingIds.has(id);
  }
}
