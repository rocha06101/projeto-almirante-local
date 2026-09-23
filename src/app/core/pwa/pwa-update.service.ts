import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Acompanha novas versões do service worker sem interromper o usuário: a versão nova só
 * é ativada (com recarga da página) quando o usuário aceita, evitando perder um formulário em uso.
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate = inject(SwUpdate, { optional: true });

  readonly updateReady = signal(false);

  constructor() {
    const sw = this.swUpdate;

    if (!sw?.isEnabled) {
      return;
    }

    sw.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));

    // Estado inconsistente do cache (ex.: arquivos de uma versão removidos): só recarregar resolve.
    sw.unrecoverable.subscribe(() => this.updateReady.set(true));

    // App instalado costuma ficar em segundo plano por dias: confere ao voltar para o primeiro plano.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        sw.checkForUpdate().catch(() => undefined);
      }
    });
  }

  async applyUpdate(): Promise<void> {
    try {
      await this.swUpdate?.activateUpdate();
    } finally {
      document.location.reload();
    }
  }

  dismiss(): void {
    this.updateReady.set(false);
  }
}
