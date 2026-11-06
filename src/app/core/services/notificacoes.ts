import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom, Observable } from 'rxjs';
import { resolveApiBaseUrl } from '../config/api-base';
import {
  MarcarLeituraResponse,
  Notificacao,
  NotificacoesPendentesResponse,
} from '../models/notificacao.model';
import { ApiService } from './api';
import { AuthService } from './auth';

interface NotificacaoCriadaEvent {
  notificacao: Notificacao;
  naoLidas: number;
}

interface NotificacaoLidaEvent {
  notificacaoId: string;
  lidaEmUtc: string;
  naoLidas: number;
}

const HUB_PATH = '/hubs/notificacoes';

@Injectable({
  providedIn: 'root',
})
export class NotificacoesService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private connection?: HubConnection;
  private startPromise?: Promise<void>;
  private pendingSync?: Promise<void>;
  private syncAgain = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private readonly readNotificationIds = new Set<string>();
  private readonly liveNotifications = new Map<string, Notificacao>();
  private eventRevision = 0;
  private sessionRevision = 0;

  readonly notifications = signal<Notificacao[]>([]);
  readonly unreadCount = signal(0);
  readonly isLoading = signal(false);
  readonly isEmpty = signal(true);
  readonly loadError = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.auth.isLoggedIn()) {
        void this.startRealtime();
      } else {
        void this.stopRealtime();
        this.resetState();
      }
    });

    this.destroyRef.onDestroy(() => void this.stopRealtime());
  }

  listarPendentes(pageSize = 20, cursor?: string | null): Observable<NotificacoesPendentesResponse> {
    const params: Record<string, string | number> = {
      pageSize,
    };

    if (cursor) {
      params['cursor'] = cursor;
    }

    return this.api.get<NotificacoesPendentesResponse>('/Notificacoes/Pendentes', { params });
  }

  marcarComoLida(id: string): Observable<MarcarLeituraResponse> {
    return this.api.post<MarcarLeituraResponse>(`/Notificacoes/${encodeURIComponent(id)}/Leitura`, {});
  }

  confirmarLeitura(id: string, naoLidas: number): void {
    this.readNotificationIds.add(id);
    this.liveNotifications.delete(id);
    this.eventRevision++;
    this.removePending(id);
    this.unreadCount.set(Math.max(0, naoLidas));
  }

  removerNotificacaoInexistente(id: string): void {
    this.readNotificationIds.add(id);
    this.liveNotifications.delete(id);
    this.eventRevision++;
    this.removePending(id);
    this.unreadCount.update(count => Math.max(0, count - 1));
  }

  async stopRealtime(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const connection = this.connection;
    this.connection = undefined;
    if (connection && connection.state !== HubConnectionState.Disconnected) {
      await connection.stop();
    }
  }

  private async startRealtime(): Promise<void> {
    if (!this.auth.isLoggedIn() || this.startPromise) {
      return this.startPromise;
    }

    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    const connection = this.connection ?? this.createConnection();
    this.connection = connection;

    this.startPromise = (async () => {
      try {
        if (connection.state === HubConnectionState.Disconnected) {
          await connection.start();
        }

        if (this.auth.isLoggedIn() && this.connection === connection) {
          this.reconnectAttempt = 0;
          await this.syncPendentes();
        }
      } catch {
        if (this.auth.isLoggedIn() && this.connection === connection) {
          console.error('Não foi possível conectar às notificações em tempo real; nova tentativa agendada.');
          await this.syncPendentes();
          this.scheduleReconnect();
        }
      }
    })().finally(() => {
      this.startPromise = undefined;
    });

    return this.startPromise;
  }

  private createConnection(): HubConnection {
    const connection = new HubConnectionBuilder()
      .withUrl(resolveHubUrl(resolveApiBaseUrl()), {
        accessTokenFactory: () => this.auth.accessTokenForSignalR(),
      })
      .withAutomaticReconnect()
      .build();

    connection.on('NotificacaoCriada', (event: NotificacaoCriadaEvent) => {
      if (
        this.connection !== connection ||
        !this.auth.isLoggedIn() ||
        !event?.notificacao?.id
      ) {
        return;
      }

      this.eventRevision++;
      this.unreadCount.set(Math.max(0, event.naoLidas ?? this.unreadCount()));
      if (!this.readNotificationIds.has(event.notificacao.id)) {
        this.liveNotifications.set(event.notificacao.id, event.notificacao);
        this.mergeNotification(event.notificacao);
      }
    });

    connection.on('NotificacaoLida', (event: NotificacaoLidaEvent) => {
      if (this.connection !== connection || !this.auth.isLoggedIn() || !event?.notificacaoId) {
        return;
      }

      this.readNotificationIds.add(event.notificacaoId);
      this.liveNotifications.delete(event.notificacaoId);
      this.eventRevision++;
      this.removePending(event.notificacaoId);
      this.unreadCount.set(Math.max(0, event.naoLidas ?? this.unreadCount()));
    });

    connection.onreconnected(() => {
      if (this.connection !== connection || !this.auth.isLoggedIn()) {
        return;
      }

      this.reconnectAttempt = 0;
      void this.syncPendentes();
    });

    connection.onclose(() => {
      if (this.auth.isLoggedIn() && this.connection === connection) {
        this.scheduleReconnect();
      }
    });

    return connection;
  }

  private scheduleReconnect(): void {
    if (!this.auth.isLoggedIn() || this.reconnectTimer) {
      return;
    }

    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.startRealtime();
    }, delay);
  }

  private syncPendentes(): Promise<void> {
    if (this.pendingSync) {
      this.syncAgain = true;
      return this.pendingSync;
    }

    this.isLoading.set(true);
    const revision = this.eventRevision;
    const sessionRevision = this.sessionRevision;
    const syncPromise = firstValueFrom(this.listarPendentes(20))
      .then(response => {
        if (sessionRevision !== this.sessionRevision || !this.auth.isLoggedIn()) {
          return;
        }

        const apiItems = (response.items ?? []).filter(item => !this.readNotificationIds.has(item.id));
        const apiIds = new Set(apiItems.map(item => item.id));
        const realtimeItems = [...this.liveNotifications.values()].filter(
          item => !apiIds.has(item.id) && !this.readNotificationIds.has(item.id),
        );
        const items = [...realtimeItems, ...apiItems];

        this.notifications.set(items);
        if (revision === this.eventRevision) {
          this.unreadCount.set(Math.max(0, response.naoLidas ?? items.length));
        }
        this.isEmpty.set(items.length === 0);
        this.loadError.set(null);
      })
      .catch(() => {
        if (sessionRevision !== this.sessionRevision || !this.auth.isLoggedIn()) {
          return;
        }

        this.isEmpty.set(this.notifications().length === 0);
        this.loadError.set('Não foi possível carregar as notificações no momento.');
      })
      .finally(() => {
        if (this.pendingSync === syncPromise) {
          this.isLoading.set(false);
          this.pendingSync = undefined;
          if (this.syncAgain && this.auth.isLoggedIn()) {
            this.syncAgain = false;
            void this.syncPendentes();
          }
        }
      });

    this.pendingSync = syncPromise;
    return syncPromise;
  }

  private mergeNotification(notification: Notificacao): void {
    if (this.readNotificationIds.has(notification.id)) {
      return;
    }

    this.notifications.update(items => [
      notification,
      ...items.filter(item => item.id !== notification.id),
    ]);
    this.isEmpty.set(false);
    this.loadError.set(null);
  }

  private removePending(id: string): void {
    this.notifications.update(items => items.filter(item => item.id !== id));
    this.isEmpty.set(this.notifications().length === 0);
  }

  private resetState(): void {
    this.readNotificationIds.clear();
    this.liveNotifications.clear();
    this.eventRevision++;
    this.sessionRevision++;
    this.pendingSync = undefined;
    this.syncAgain = false;
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.isLoading.set(false);
    this.isEmpty.set(true);
    this.loadError.set(null);
  }
}

function resolveHubUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/api\/?$/i, '');
  return `${base}${HUB_PATH}`;
}
