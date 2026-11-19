import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState } from '@microsoft/signalr';
import { catchError, defer, EMPTY, filter, firstValueFrom, Observable, tap, throwError } from 'rxjs';
import { resolveApiBaseUrl } from '../config/api-base';
import {
  MarcarLeituraResponse,
  MarcarTodasLeiturasResponse,
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
      const userId = this.auth.user()?.id;
      const loggedIn = this.auth.isLoggedIn();
      const stopped = this.stopRealtime();
      this.resetState();
      const revision = this.sessionRevision;
      if (loggedIn) {
        void stopped.then(() => {
          if (this.isCurrentSession(revision, userId)) {
            void this.startRealtime();
          }
        });
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
    return defer(() => {
      const session = this.sessionRevision;
      const userId = this.auth.user()?.id;
      const revision = this.eventRevision;
      return this.api.post<MarcarLeituraResponse>(`/Notificacoes/${encodeURIComponent(id)}/Leitura`, {}).pipe(
        tap({
          next: response => {
            if (!this.isCurrentSession(session, userId)) {
              return;
            }

            const currentCount = revision === this.eventRevision
              ? response.naoLidas ?? this.unreadCount() - 1
              : this.unreadCount();
            this.confirmarLeitura(id, currentCount);
            void this.syncPendentes(false);
          },
          error: (error: unknown) => {
            if (this.isCurrentSession(session, userId) && error instanceof HttpErrorResponse && error.status === 404) {
              this.removerNotificacaoInexistente(id);
              void this.syncPendentes(false);
            }
          },
        }),
      );
    });
  }

  marcarTodasComoLidas(): Observable<MarcarTodasLeiturasResponse> {
    return defer(() => {
      const session = this.sessionRevision;
      const userId = this.auth.user()?.id;
      const revision = this.eventRevision;
      return this.api.post<MarcarTodasLeiturasResponse>('/Notificacoes/Leitura/Todas', null).pipe(
        catchError((error: unknown) =>
          this.isCurrentSession(session, userId) ? throwError(() => error) : EMPTY,
        ),
        filter(() => this.isCurrentSession(session, userId)),
        tap(response => {
          if (
            !response ||
            !Number.isInteger(response.marcadas) || response.marcadas < 0 ||
            !Number.isInteger(response.naoLidas) || response.naoLidas < 0 ||
            typeof response.limiteUtc !== 'string' || !Number.isFinite(Date.parse(response.limiteUtc))
          ) {
            throw new Error('Resposta inválida ao marcar notificações como lidas.');
          }

          const limit = Date.parse(response.limiteUtc);
          const remaining = this.notifications().filter(notification => {
            // A API tem precisão submilissegundo. A consulta resolve empates no mesmo milissegundo.
            if (Date.parse(notification.criadaEmUtc ?? '') < limit) {
              this.readNotificationIds.add(notification.id);
              this.liveNotifications.delete(notification.id);
              return false;
            }

            return true;
          });
          this.notifications.set(remaining);
          this.isEmpty.set(remaining.length === 0);
          if (revision === this.eventRevision) {
            this.unreadCount.set(response.naoLidas);
          }
          this.eventRevision++;
          void this.syncPendentes(false);
        }),
      );
    });
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
    this.startPromise = undefined;
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
    const session = this.sessionRevision;
    const userId = this.auth.user()?.id;
    const isCurrentConnection = () =>
      this.connection === connection && this.isCurrentSession(session, userId);

    const startPromise = (async () => {
      try {
        if (connection.state === HubConnectionState.Disconnected) {
          await connection.start();
        }

        if (isCurrentConnection()) {
          this.reconnectAttempt = 0;
          await this.syncPendentes();
        }
      } catch {
        if (isCurrentConnection()) {
          console.error('Não foi possível conectar às notificações em tempo real; nova tentativa agendada.');
          await this.syncPendentes();
          if (isCurrentConnection()) {
            this.scheduleReconnect();
          }
        }
      }
    })().finally(() => {
      if (this.startPromise === startPromise) {
        this.startPromise = undefined;
      }
    });

    this.startPromise = startPromise;
    return startPromise;
  }

  private createConnection(): HubConnection {
    const connection = new HubConnectionBuilder()
      .withUrl(resolveHubUrl(resolveApiBaseUrl()), {
        accessTokenFactory: () => this.auth.accessTokenForSignalR(),
      })
      .withAutomaticReconnect()
      .build();

    const session = this.sessionRevision;
    const userId = this.auth.user()?.id;
    const isCurrentConnection = () => this.connection === connection && this.isCurrentSession(session, userId);

    connection.on('NotificacaoCriada', (event: NotificacaoCriadaEvent) => {
      const notification = event?.notificacao;
      if (!isCurrentConnection() || !notification?.id ||
          this.readNotificationIds.has(notification.id) || this.liveNotifications.has(notification.id) ||
          this.notifications().some(item => item.id === notification.id)) {
        return;
      }

      this.eventRevision++;
      this.liveNotifications.set(notification.id, notification);
      this.mergeNotification(notification);
      void this.syncPendentes(false);
    });

    connection.on('NotificacaoLida', (event: NotificacaoLidaEvent) => {
      if (!isCurrentConnection() || !event?.notificacaoId || this.readNotificationIds.has(event.notificacaoId)) {
        return;
      }

      this.readNotificationIds.add(event.notificacaoId);
      this.liveNotifications.delete(event.notificacaoId);
      this.eventRevision++;
      this.removePending(event.notificacaoId);
      void this.syncPendentes(false);
    });

    connection.onreconnected(() => {
      if (!isCurrentConnection()) {
        return;
      }

      this.reconnectAttempt = 0;
      void this.syncPendentes();
    });

    connection.onclose(() => {
      if (isCurrentConnection()) {
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

  private syncPendentes(showLoading = true): Promise<void> {
    if (this.pendingSync) {
      this.syncAgain = true;
      return this.pendingSync;
    }

    if (showLoading) {
      this.isLoading.set(true);
    }
    const revision = this.eventRevision;
    const sessionRevision = this.sessionRevision;
    const userId = this.auth.user()?.id;
    const syncPromise = firstValueFrom(this.listarPendentes(20))
      .then(response => {
        if (!this.isCurrentSession(sessionRevision, userId)) {
          return;
        }

        if (revision !== this.eventRevision) {
          this.syncAgain = true;
          return;
        }

        const items = (response.items ?? []).filter(item => !this.readNotificationIds.has(item.id));
        this.liveNotifications.clear();
        this.notifications.set(items);
        this.unreadCount.set(Math.max(0, response.naoLidas ?? items.length));
        this.isEmpty.set(items.length === 0);
        this.loadError.set(null);
      })
      .catch(() => {
        if (!showLoading || !this.isCurrentSession(sessionRevision, userId)) {
          return;
        }

        this.isEmpty.set(this.notifications().length === 0);
        this.loadError.set('Não foi possível carregar as notificações no momento.');
      })
      .finally(() => {
        if (this.pendingSync === syncPromise) {
          this.isLoading.set(false);
          this.pendingSync = undefined;
          if (this.syncAgain && this.isCurrentSession(sessionRevision, userId)) {
            this.syncAgain = false;
            void this.syncPendentes(showLoading);
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

  private isCurrentSession(revision: number, userId: string | undefined): boolean {
    return revision === this.sessionRevision && this.auth.isLoggedIn() && this.auth.user()?.id === userId;
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
