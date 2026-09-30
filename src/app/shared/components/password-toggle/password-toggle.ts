import { Component, model } from '@angular/core';

/**
 * Botão para exibir/ocultar o conteúdo de um campo de senha.
 * Uso: `[(visible)]="mostrarSenha"` e, no campo, `[type]="mostrarSenha() ? 'text' : 'password'"`.
 */
@Component({
  selector: 'app-password-toggle',
  standalone: true,
  templateUrl: './password-toggle.html',
  styleUrl: './password-toggle.scss',
})
export class PasswordToggleComponent {
  /** true quando a senha está visível; começa oculta. */
  readonly visible = model(false);

  toggle() {
    this.visible.update((visible) => !visible);
  }
}
