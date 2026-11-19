import { CommonModule, DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { Notificacao } from '../../../core/models/notificacao.model';
import { AuthService } from '../../../core/services/auth';
import { NotificacoesService } from '../../../core/services/notificacoes';
import { ToastService } from '../../../core/services/toast.service';
import { UserAvatarService } from '../../../core/services/user-avatar.service';

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
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly userAvatar = inject(UserAvatarService);
  private readonly datePipe = inject(DatePipe);
  private readonly readingIds = new Set<string>();

  @ViewChild('profileWrapper') profileWrapper?: ElementRef<HTMLElement>;
  @ViewChild('notificationWrapper') notificationWrapper?: ElementRef<HTMLElement>;

  searchQuery = signal('');
  profileOpen = signal(false);
  notificationOpen = signal(false);
  notifications = this.notificacoesService.notifications;
  unreadCount = this.notificacoesService.unreadCount;
  readonly isClearingNotifications = signal(false);
  readonly hasPendingNotifications = computed(
    () => this.unreadCount() > 0 || this.notifications().length > 0,
  );
  isLoading = this.notificacoesService.isLoading;
  isEmpty = this.notificacoesService.isEmpty;
  loadError = this.notificacoesService.loadError;

  /** Dados do usuário autenticado (vindos de /Auth/Me). */
  userInfo = computed(() => {
    const user = this.auth.user();

    return {
      name: user?.nome ?? 'Usuário',
      role: user?.cargo?.nome ?? '',
      avatar: this.userAvatar.avatarUrl(),
    };
  });

  onAvatarError(event: Event): void {
    this.userAvatar.onImageError(event);
  }

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
    if (this.isClearingNotifications() || !this.hasPendingNotifications()) {
      return;
    }

    this.isClearingNotifications.set(true);
    this.notificacoesService.marcarTodasComoLidas().pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.isClearingNotifications.set(false)),
    ).subscribe({
      next: () => this.toast.success('Notificações marcadas como lidas.'),
      error: () => this.toast.error('Não foi possível limpar as notificações. Tente novamente.'),
    });
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

    this.notificacoesService.marcarComoLida(notification.id).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.readingIds.delete(notification.id)),
    ).subscribe({ error: () => {} });
  }

  isNotificationReading(id: string): boolean {
    return this.readingIds.has(id);
  }
}
