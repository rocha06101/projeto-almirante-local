import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { finalize, take } from 'rxjs';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
import { Router, RouterModule } from '@angular/router';
import { UsuarioNavigationState, readNavigationState } from './usuario-navigation';
import { describeUsuarioError } from './usuarios-api-errors';

@Component({
  selector: 'app-desbravadores',
  standalone: true,
  imports: [CommonModule, RouterModule, A11yModule],
  templateUrl: './desbravadores.html',
  styleUrl: './desbravadores.scss',
})
export class Desbravadores implements OnInit {
  private userService = inject(UserService);
  private router = inject(Router);

  usuarios = signal<UserModel[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  /** `?includeInactive=true` na API: inclui os excluídos logicamente. */
  includeInactive = signal(false);
  /** Mensagem de sucesso (cadastro/alteração vindos do formulário, ou exclusão). */
  successMessage = signal(readNavigationState(this.router).feedback ?? '');

  usuarioParaExcluir = signal<UserModel | null>(null);
  isDeleting = signal(false);
  deleteError = signal('');

  ngOnInit(): void {
    this.carregarUsuarios();
  }

  carregarUsuarios(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.userService
      .listarUsuarios({ includeInactive: this.includeInactive() })
      .pipe(
        take(1),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: usuarios => this.usuarios.set(usuarios),
        error: error => {
          this.usuarios.set([]);
          this.errorMessage.set(describeUsuarioError(error, 'Nao foi possivel carregar os usuarios.'));
        },
      });
  }

  alternarInativos(event: Event): void {
    this.includeInactive.set((event.target as HTMLInputElement).checked);
    this.carregarUsuarios();
  }

  editar(usuario: UserModel): void {
    this.router.navigate(['/desbravadores/editar'], { state: { usuario } satisfies UsuarioNavigationState });
  }

  solicitarExclusao(usuario: UserModel): void {
    this.deleteError.set('');
    this.successMessage.set('');
    this.usuarioParaExcluir.set(usuario);
  }

  cancelarExclusao(): void {
    if (this.isDeleting()) {
      return;
    }
    this.usuarioParaExcluir.set(null);
    this.deleteError.set('');
  }

  /** A API decide se pode excluir (eventos futuros, próprio usuário, já inativo); a mensagem dela é exibida no modal. */
  confirmarExclusao(): void {
    const usuario = this.usuarioParaExcluir();
    if (!usuario || this.isDeleting()) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');
    this.userService
      .excluirUsuario(usuario.id)
      .pipe(
        take(1),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.usuarioParaExcluir.set(null);
          this.successMessage.set(`${usuario.nome} foi excluído com sucesso.`);
          this.carregarUsuarios();
        },
        error: error => this.deleteError.set(describeUsuarioError(error, 'Não foi possível excluir o usuário. Tente novamente.')),
      });
  }
}
