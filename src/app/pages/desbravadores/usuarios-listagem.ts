import { Directive, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, finalize, map, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
import { ToastService } from '../../core/services/toast.service';
import { Router } from '@angular/router';
import { isValidSelectedUser, UsuarioNavigationState } from './usuario-navigation';
import { describeUsuarioError } from './usuarios-api-errors';
import { PermissoesService } from '../../core/services/permissoes';

export type UsuarioListagem = Omit<UserModel, 'email' | 'dataCriacao'> &
  Partial<Pick<UserModel, 'email' | 'dataCriacao'>>;

export const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

@Directive()
export abstract class UsuariosListagem {
  protected readonly userService = inject(UserService);
  protected readonly router = inject(Router);
  protected readonly toast = inject(ToastService);
  protected readonly destroyRef = inject(DestroyRef);
  readonly permissoes = inject(PermissoesService);
  private readonly fonte = computed(() => {
    if (this.permissoes.tem('usuarios.consultar')) return 'usuarios';
    return this.permissoes.tem('membros.consultar') ? 'membros' : null;
  });
  readonly consultaAdministrativa = computed(() => this.fonte() === 'usuarios');
  readonly podeConsultar = computed(() => this.fonte() !== null);
  private consultaEmCurso?: Subscription;

  usuarios = signal<UsuarioListagem[]>([]);
  isLoading = signal(false);
  errorMessage = signal('');

  /** Busca local (nome ou cargo) sobre os usuários já carregados; ignora acentos e maiúsculas. */
  termoBusca = signal('');
  usuariosFiltrados = computed(() => {
    const termo = normalizar(this.termoBusca().trim());
    if (!termo) {
      return this.usuarios();
    }
    return this.usuarios().filter(usuario =>
      normalizar(`${usuario.nome} ${this.perfil(usuario) ?? ''}`).includes(termo),
    );
  });

  /** `?includeInactive=true` na API: inclui os excluídos logicamente. */
  includeInactive = signal(false);

  usuarioParaExcluir = signal<UsuarioListagem | null>(null);
  isDeleting = signal(false);
  deleteError = signal('');

  constructor() {
    effect(() => {
      // O layout atualiza as permissões periodicamente, inclusive com a página aberta.
      const fonte = this.fonte();
      untracked(() => {
        this.consultaEmCurso?.unsubscribe();
        this.usuarios.set([]);
        this.errorMessage.set('');
        this.usuarioParaExcluir.set(null);
        this.deleteError.set('');
        this.includeInactive.set(false);
        this.aposCarregarUsuarios([]);
        if (fonte) this.carregarUsuarios();
      });
    });
  }

  perfil(usuario: UsuarioListagem): string | undefined {
    return usuario.cargo?.nome ?? usuario.funcao ?? usuario.roles;
  }

  readonly temPermissaoEdicao = computed(() =>
    this.consultaAdministrativa() && this.permissoes.tem('usuarios.editar') &&
    this.permissoes.tem('cargos.consultar'),
  );

  podeEditar(usuario: UsuarioListagem): boolean {
    return this.temPermissaoEdicao() && usuario.ativo !== false &&
      usuario.dataCriacao != null && isValidSelectedUser(usuario);
  }

  podeExcluir(usuario: UsuarioListagem): boolean {
    return this.podeConsultar() && usuario.ativo !== false && this.permissoes.tem('usuarios.excluir');
  }

  protected aposCarregarUsuarios(_usuarios: UsuarioListagem[]): void {}

  carregarUsuarios(): void {
    if (this.isLoading() || !this.podeConsultar()) return;
    this.isLoading.set(true);
    this.errorMessage.set('');

    const lista: Observable<UsuarioListagem[]> = this.consultaAdministrativa()
      ? this.userService.listarUsuarios({ includeInactive: this.includeInactive() })
      : this.userService.listarMembros().pipe(
          map(membros => membros.map(({ id, nome, cargo }) => ({ id, nome, funcao: cargo }))),
        );

    this.consultaEmCurso = lista
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: usuarios => {
          this.usuarios.set(usuarios);
          this.aposCarregarUsuarios(usuarios);
        },
        error: error => {
          this.usuarios.set([]);
          this.errorMessage.set(describeUsuarioError(error, 'Não foi possível carregar os usuários.'));
        },
      });
  }

  alternarInativos(event: Event): void {
    this.includeInactive.set((event.target as HTMLInputElement).checked);
    this.carregarUsuarios();
  }

  editar(usuario: UsuarioListagem): void {
    const { email, dataCriacao } = usuario;
    if (!this.podeEditar(usuario) || email == null || dataCriacao == null) return;
    this.router.navigate(['/desbravadores/editar'], { state: { usuario: { ...usuario, email, dataCriacao } } satisfies UsuarioNavigationState });
  }

  solicitarExclusao(usuario: UsuarioListagem): void {
    if (!this.podeExcluir(usuario)) {
      this.toast.error('Você não tem permissão para excluir usuários.');
      return;
    }
    this.deleteError.set('');
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
    if (!this.podeExcluir(usuario)) {
      this.deleteError.set('Você não tem permissão para excluir usuários.');
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set('');
    this.userService
      .excluirUsuario(usuario.id)
      .pipe(
        take(1),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.usuarioParaExcluir.set(null);
          this.toast.success(`${usuario.nome} foi excluído com sucesso.`);
          this.carregarUsuarios();
        },
        error: error => {
          const message = describeUsuarioError(error, 'Não foi possível excluir o usuário. Tente novamente.');
          this.deleteError.set(message);
          this.toast.error(message);
        },
      });
  }
}
