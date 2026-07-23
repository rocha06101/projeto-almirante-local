import { Component, inject, signal, ElementRef, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './topbar.html',
  styleUrl: './topbar.scss',
})
export class TopbarComponent {
  private router = inject(Router);

  @ViewChild('profilePopup') profilePopup!: ElementRef;
  @ViewChild('profileButton') profileButton!: ElementRef;

  searchQuery = signal('');
  profileOpen = signal(false);
  notificationOpen = signal(false);

  notifications = signal([
    { id: 1, message: 'Nova atividade atribuída', type: 'info', timestamp: 'há 5 minutos' },
    { id: 2, message: 'Desbravador registrado com sucesso', type: 'success', timestamp: 'há 1 hora' },
  ]);

  userInfo = {
    name: 'Paolla',
    role: 'Diretora',
    avatar: '/icons/user-icon2.svg'
  };

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

  @HostListener('document:click', ['$event'])
  closePopups(event: MouseEvent) {
    const clickedInsideProfile = this.profilePopup?.nativeElement.contains(event.target);
    const clickedProfileButton = this.profileButton?.nativeElement.contains(event.target);

    if (!clickedInsideProfile && !clickedProfileButton) {
      this.profileOpen.set(false);
    }
  }

  viewProfile() {
    this.router.navigate(['/perfil']);
    this.profileOpen.set(false);
  }

  logout() {
    // Implementar logout
    this.router.navigate(['/login']);
  }

  clearNotifications() {
    this.notifications.set([]);
  }
}
