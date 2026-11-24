import { A11yModule } from '@angular/cdk/a11y';
import { Component, input, output } from '@angular/core';
import { UsuarioListagem } from './usuarios-listagem';

@Component({
  selector: 'app-excluir-usuario-dialog',
  imports: [A11yModule],
  templateUrl: './excluir-usuario-dialog.html',
  styleUrl: './excluir-usuario-dialog.scss',
})
export class ExcluirUsuarioDialog {
  readonly usuario = input.required<UsuarioListagem>();
  readonly isDeleting = input(false);
  readonly deleteError = input('');
  readonly cancelar = output<void>();
  readonly confirmar = output<void>();
}
