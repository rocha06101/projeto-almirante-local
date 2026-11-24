import { Component, OnInit, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { take } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RefreshButton } from '../../shared/components/refresh-button/refresh-button';
import { readNavigationState } from './usuario-navigation';
import { UsuarioListagem, UsuariosListagem } from './usuarios-listagem';
import { ExcluirUsuarioDialog } from './excluir-usuario-dialog';

@Component({
  selector: 'app-desbravadores',
  standalone: true,
  imports: [RouterModule, RefreshButton, ExcluirUsuarioDialog],
  templateUrl: './desbravadores.html',
  styleUrl: './desbravadores.scss',
})
export class Desbravadores extends UsuariosListagem implements OnInit {
  private readonly fotosCache = new Map<string, { fotoUrl: string; objectUrl: string }>();
  private readonly fotosEmCarregamento = new Map<string, string>();
  fotoSources = signal<Record<string, string>>({});
  fotosFalhas = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      for (const { objectUrl } of this.fotosCache.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      this.fotosCache.clear();
    });

    const feedback = readNavigationState(this.router).feedback;
    if (feedback) {
      this.toast.success(feedback);
    }
  }

  fotoExibicao(usuario: UsuarioListagem): string | null {
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

  protected override aposCarregarUsuarios(usuarios: UsuarioListagem[]): void {
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
}
