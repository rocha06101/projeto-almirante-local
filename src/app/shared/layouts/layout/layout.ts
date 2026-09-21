import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar';
import { TopbarComponent } from '../topbar/topbar';

/** A partir daqui há largura para a barra lateral completa; abaixo disso ela começa como trilho de ícones. */
const DESKTOP_QUERY = '(min-width: 1200px)';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './layout.html',
  styleUrl: './layout.scss',
})
export class LayoutComponent {
  /**
   * Estado inicial decidido uma única vez (sem listener de resize): o restante da adaptação
   * ao viewport é feito por CSS. O usuário pode alternar manualmente em qualquer largura.
   */
  readonly sidebarExpanded = signal(globalThis.matchMedia?.(DESKTOP_QUERY).matches ?? true);
}
