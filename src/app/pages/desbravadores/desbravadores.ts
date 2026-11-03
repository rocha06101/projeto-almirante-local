import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { finalize, take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { User as UserModel } from '../../core/models/user.model';
import { User as UserService } from '../../core/services/user';
import { Router, RouterModule } from '@angular/router';
import { UsuarioNavigationState, readNavigationState } from './usuario-navigation';
import { describeUsuarioError } from './usuarios-api-errors';

const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly fotosCache = new Map<string, { fotoUrl: string; objectUrl: string }>();
  private readonly fotosEmCarregamento = new Map<string, string>();
  fotoSources = signal<Record<string, string>>({});
  fotosFalhas = signal<Record<string, string>>({});

  usuarios = signal<UserModel[]>([]);
  isLoading = signal(true);
  errorMessage = signal('');

  /** Busca local (nome ou cargo) sobre os usuários já carregados; ignora acentos e maiúsculas. */
  termoBusca = signal('');
  usuariosFiltrados = computed(() => {
    const termo = normalizar(this.termoBusca().trim());
    if (!termo) {
      return this.usuarios();
    }
    return this.usuarios().filter(usuario =>
      normalizar(`${usuario.nome} ${usuario.cargo?.nome ?? usuario.funcao ?? usuario.roles ?? ''}`).includes(termo),
    );
  });

  /** `?includeInactive=true` na API: inclui os excluídos logicamente. */
  includeInactive = signal(false);
  /** Mensagem de sucesso (cadastro/alteração vindos do formulário, ou exclusão). */
  successMessage = signal(readNavigationState(this.router).feedback ?? '');

  usuarioParaExcluir = signal<UserModel | null>(null);
  isDeleting = signal(false);
  deleteError = signal('');

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      for (const { objectUrl } of this.fotosCache.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      this.fotosCache.clear();
    });
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
        next: usuarios => {
          this.usuarios.set(usuarios);
          this.carregarFotos(usuarios);
        },
        error: error => {
          this.usuarios.set([]);
          this.errorMessage.set(describeUsuarioError(error, 'Nao foi possivel carregar os usuarios.'));
        },
      });
  }

  fotoExibicao(usuario: UserModel): string | null {
    const fotoUrl = usuario.fotoUrl;
    if (!fotoUrl || this.fotosFalhas()[usuario.id] === fotoUrl) {
      return null;
    }
    return this.fotoSources()[usuario.id] ?? null;
  }

  onFotoError(usuarioId: string): void {
    const foto = this.fotosCache.get(usuarioId);
    if (foto) {
      URL.revokeObjectURL(foto.objectUrl);
      this.fotosCache.delete(usuarioId);
      this.fotoSources.update(sources => {
        const updated = { ...sources };
        delete updated[usuarioId];
        return updated;
      });
      this.fotosFalhas.update(falhas => ({ ...falhas, [usuarioId]: foto.fotoUrl }));
    }
  }

  private carregarFotos(usuarios: UserModel[]): void {
    const usuariosPorId = new Map(usuarios.map(usuario => [usuario.id, usuario]));

    for (const [usuarioId, foto] of this.fotosCache) {
      if (usuariosPorId.get(usuarioId)?.fotoUrl !== foto.fotoUrl) {
        URL.revokeObjectURL(foto.objectUrl);
        this.fotosCache.delete(usuarioId);
        this.fotoSources.update(sources => {
          const updated = { ...sources };
          delete updated[usuarioId];
          return updated;
        });
      }
    }

    for (const [usuarioId, fotoUrl] of this.fotosEmCarregamento) {
      if (usuariosPorId.get(usuarioId)?.fotoUrl !== fotoUrl) {
        this.fotosEmCarregamento.delete(usuarioId);
      }
    }

    this.fotosFalhas.update(falhas => {
      const updated = { ...falhas };
      for (const [usuarioId, fotoUrl] of Object.entries(updated)) {
        if (usuariosPorId.get(usuarioId)?.fotoUrl !== fotoUrl) {
          delete updated[usuarioId];
        }
      }
      return updated;
    });

    for (const usuario of usuarios) {
      const fotoUrl = usuario.fotoUrl;
      if (
        !fotoUrl ||
        this.fotosCache.get(usuario.id)?.fotoUrl === fotoUrl ||
        this.fotosEmCarregamento.get(usuario.id) === fotoUrl ||
        this.fotosFalhas()[usuario.id] === fotoUrl
      ) {
        continue;
      }

      this.fotosEmCarregamento.set(usuario.id, fotoUrl);
      this.userService
        .obterFotoPorUrl(fotoUrl)
        .pipe(take(1), takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: foto => {
            if (this.fotosEmCarregamento.get(usuario.id) !== fotoUrl) {
              return;
            }
            this.fotosEmCarregamento.delete(usuario.id);
            if (this.usuarios().find(atual => atual.id === usuario.id)?.fotoUrl !== fotoUrl) {
              return;
            }

            const objectUrl = URL.createObjectURL(foto);
            this.fotosCache.set(usuario.id, { fotoUrl, objectUrl });
            this.fotoSources.update(sources => ({ ...sources, [usuario.id]: objectUrl }));
          },
          error: () => {
            if (this.fotosEmCarregamento.get(usuario.id) === fotoUrl) {
              this.fotosEmCarregamento.delete(usuario.id);
              this.fotosFalhas.update(falhas => ({ ...falhas, [usuario.id]: fotoUrl }));
            }
          },
        });
    }
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
