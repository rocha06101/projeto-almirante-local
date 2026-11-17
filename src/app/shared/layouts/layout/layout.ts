import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter, switchMap, timer } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { PermissoesService } from '../../../core/services/permissoes';
import { TopbarComponent } from '../topbar/topbar';

/** A partir daqui há largura para a barra lateral completa; abaixo disso ela começa como trilho de ícones. */
const DESKTOP_QUERY = '(min-width: 1200px)';
const INTERVALO_PERMISSOES_MS = 60_000;

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class LayoutComponent {
  private readonly auth = inject(AuthService);
  private readonly permissoes = inject(PermissoesService);

  constructor() {
    // A revisão global é publicada por /Me/Permissoes. Mantém o menu atualizado
    // mesmo quando o usuário permanece na mesma tela.
    timer(INTERVALO_PERMISSOES_MS, INTERVALO_PERMISSOES_MS).pipe(
      filter(() => this.auth.isLoggedIn()),
      switchMap(() => this.permissoes.atualizar()),
      takeUntilDestroyed(),
    ).subscribe();
  }

  /**
   * Estado inicial decidido uma única vez (sem listener de resize): o restante da adaptação
   * ao viewport é feito por CSS. O usuário pode alternar manualmente em qualquer largura.
   */
  readonly sidebarExpanded = signal(globalThis.matchMedia?.(DESKTOP_QUERY).matches ?? true);
}
