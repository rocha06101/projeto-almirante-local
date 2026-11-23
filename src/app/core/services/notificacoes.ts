import { HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { HubConnection, HubConnectionBuilder, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { catchError, defer, EMPTY, filter, finalize, firstValueFrom, Observable, of, retry, Subject, tap, throwError } from 'rxjs';
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
  private stopPromise?: Promise<void>;
  private pendingSync?: Promise<void>;
  private syncAgain = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private realtimeRevision = 0;
  private readonly readNotificationIds = new Set<string>();
  private readonly liveNotifications = new Map<string, Notificacao>();
  private readonly devolucoesNotificadas = new Set<string>();
  private readonly eventosAlterados = new Subject<string | null>();
  private eventRevision = 0;
  private sessionRevision = 0;
  private sessionUserId?: string;
  private batchPending = false;

  readonly notifications = signal<Notificacao[]>([]);
  readonly unreadCount = signal(0);
  readonly isLoading = signal(false);
  readonly isEmpty = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly eventosAlterados$ = this.eventosAlterados.asObservable();

  constructor() {
    effect(() => {
      const userId = this.auth.isLoggedIn() ? this.auth.user()?.id : undefined;
      if (userId === this.sessionUserId) {
        return;
      }

      if (this.sessionUserId !== undefined) {
        this.resetState();
      }
      this.sessionUserId = userId;

      const stopped = this.stopRealtime();
      const session = this.sessionRevision;
      const realtime = this.realtimeRevision;
      if (userId !== undefined) {
        void stopped.then(() => {
          if (realtime === this.realtimeRevision && this.isCurrentSession(session, userId)) {
            void this.startRealtime();
          }
        });
      }
    });

    this.destroyRef.onDestroy(() => {
      this.sessionUserId = undefined;
      void this.stopRealtime();
    });
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
      const isCurrent = () => this.isCurrentSession(session, userId);
      if (!isCurrent()) {
        return EMPTY;
      }

      return this.api.post<MarcarLeituraResponse>(`/Notificacoes/${encodeURIComponent(id)}/Leitura`, {}).pipe(
        catchError((error: unknown) => isCurrent() ? throwError(() => error) : EMPTY),
        filter(isCurrent),
        tap({
          next: response => {
            const currentCount = revision === this.eventRevision
              ? response.naoLidas
              : undefined;
            this.confirmarLeitura(id, currentCount);
            void this.syncPendentes(false);
          },
          error: (error: unknown) => {
            if (error instanceof HttpErrorResponse && error.status === 404) {
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
      if (!this.isCurrentSession(session, userId) || this.batchPending) {
        return EMPTY;
      }

      this.batchPending = true;
      return this.api.post<MarcarTodasLeiturasResponse>('/Notificacoes/Leitura/Todas', null).pipe(
        catchError((error: unknown) =>
          this.isCurrentSession(session, userId) ? throwError(() => error) : EMPTY,
        ),
        filter(() => this.isCurrentSession(session, userId)),
        tap(response => {
          const limit = parseUtcTicks(response?.limiteUtc);
          if (
            !response ||
            !Number.isInteger(response.marcadas) || response.marcadas < 0 ||
            !Number.isInteger(response.naoLidas) || response.naoLidas < 0 ||
            limit === undefined
          ) {
            throw new Error('Resposta inválida ao marcar notificações como lidas.');
          }

          const remaining = this.notifications().filter(notification => {
            const createdAt = parseUtcTicks(notification.criadaEmUtc);
            if (createdAt !== undefined && createdAt <= limit) {
              this.readNotificationIds.add(notification.id);
              this.liveNotifications.delete(notification.id);
              return false;
            }

            return true;
          });
          this.notifications.set(remaining);
          this.isEmpty.set(remaining.length === 0);
          this.unreadCount.set(response.naoLidas);
          this.eventRevision++;
          this.syncAgain = true;
        }),
        finalize(() => {
          if (!this.isCurrentSession(session, userId)) {
            return;
          }

          this.batchPending = false;
          if (this.syncAgain) {
            void this.syncPendentes(false);
          }
        }),
      );
    });
  }

  confirmarLeitura(id: string, naoLidas?: number): void {
    this.readNotificationIds.add(id);
    this.liveNotifications.delete(id);
    this.eventRevision++;
    this.removePending(id);
    if (naoLidas !== undefined) {
      this.unreadCount.set(Math.max(0, naoLidas));
    }
  }

  removerNotificacaoInexistente(id: string): void {
    this.confirmarLeitura(id);
  }

  async stopRealtime(): Promise<void> {
    this.realtimeRevision++;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    const connection = this.connection;
    this.connection = undefined;
    this.startPromise = undefined;
    this.reconnectAttempt = 0;
    if (connection && connection.state !== HubConnectionState.Disconnected) {
      const stopping = connection.stop().finally(() => {
        if (this.stopPromise === stopping) this.stopPromise = undefined;
      });
      this.stopPromise = stopping;
    }
    await this.stopPromise;
  }

  private async startRealtime(): Promise<void> {
    const session = this.sessionRevision;
    const userId = this.sessionUserId;
    if (!this.isCurrentSession(session, userId) || this.startPromise) {
      return this.startPromise;
    }

    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;

    const connection = this.connection ?? this.createConnection();
    this.connection = connection;
    const isCurrentConnection = () =>
      this.connection === connection && this.isCurrentSession(session, userId);

    const startPromise = (async () => {
      try {
        if (connection.state === HubConnectionState.Disconnected) {
          await connection.start();
        }

        if (isCurrentConnection()) {
          const recuperouConexao = this.reconnectAttempt > 0;
          this.reconnectAttempt = 0;
          if (recuperouConexao) this.eventosAlterados.next(null);
          void this.syncPendentes();
        }
      } catch {
        if (isCurrentConnection()) {
          console.error('Não foi possível conectar às notificações em tempo real; nova tentativa agendada.');
          void this.syncPendentes();
          this.scheduleReconnect();
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
      // O transporte pode incluir a URL do WebSocket com o bearer nos logs.
      .configureLogging(LogLevel.None)
      .withAutomaticReconnect()
      .build();

    const session = this.sessionRevision;
    const userId = this.auth.user()?.id;
    const isCurrentConnection = () => this.connection === connection && this.isCurrentSession(session, userId);

    connection.on('NotificacaoCriada', (event: NotificacaoCriadaEvent) => {
      const notification = event?.notificacao;
      if (!isCurrentConnection() || !notification?.id) return;

      // O REST pode ter listado a notificação antes de o publicador enviar o aviso.
      if (notification.tipo === 'DevolucaoEvento' && !this.devolucoesNotificadas.has(notification.id)) {
        this.devolucoesNotificadas.add(notification.id);
        this.eventosAlterados.next(notification.eventoId ?? null);
      }
      if (this.readNotificationIds.has(notification.id) || this.liveNotifications.has(notification.id) ||
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
      this.eventosAlterados.next(null);
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
    if (this.batchPending) {
      // A consulta precisa começar após a confirmação do lote para incluir o commit.
      this.syncAgain = true;
      return Promise.resolve();
    }

    if (this.pendingSync) {
      this.syncAgain = true;
      return this.pendingSync;
    }

    if (showLoading) {
      this.isLoading.set(true);
    }
    this.syncAgain = false;
    const revision = this.eventRevision;
    const sessionRevision = this.sessionRevision;
    const userId = this.auth.user()?.id;
    const isCurrent = () => this.isCurrentSession(sessionRevision, userId);
    const syncPromise = firstValueFrom(defer(() => this.listarPendentes(20)).pipe(
      retry({
        count: 1,
        delay: (error: unknown) =>
          !showLoading && !this.batchPending && revision === this.eventRevision &&
          isCurrent() && error instanceof HttpErrorResponse &&
          (error.status === 0 || error.status >= 500)
            ? of(null)
            : throwError(() => error),
      }),
    ))
      .then(response => {
        if (!isCurrent()) {
          return;
        }

        if (this.batchPending || revision !== this.eventRevision) {
          this.syncAgain = true;
          return;
        }

        if (!Array.isArray(response?.items) ||
            !Number.isInteger(response.naoLidas) || response.naoLidas < 0) {
          throw new Error('Resposta inválida ao consultar notificações pendentes.');
        }

        const items = response.items.filter(item => !this.readNotificationIds.has(item.id));
        this.liveNotifications.clear();
        this.notifications.set(items);
        this.unreadCount.set(response.naoLidas);
        this.isEmpty.set(items.length === 0);
        this.loadError.set(null);
      })
      .catch(() => {
        if (!isCurrent()) {
          return;
        }
        if (this.batchPending || revision !== this.eventRevision) {
          this.syncAgain = true;
          return;
        }
        if (!showLoading) {
          return;
        }

        this.isEmpty.set(this.notifications().length === 0);
        this.loadError.set('Não foi possível carregar as notificações no momento.');
      })
      .finally(() => {
        if (this.pendingSync === syncPromise) {
          this.isLoading.set(false);
          this.pendingSync = undefined;
          if (this.syncAgain && !this.batchPending && isCurrent()) {
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
    return userId !== undefined && this.sessionUserId === userId &&
      revision === this.sessionRevision && this.auth.isLoggedIn() && this.auth.user()?.id === userId;
  }

  private resetState(): void {
    this.readNotificationIds.clear();
    this.liveNotifications.clear();
    this.devolucoesNotificadas.clear();
    this.eventRevision++;
    this.sessionRevision++;
    this.pendingSync = undefined;
    this.syncAgain = false;
    this.batchPending = false;
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.isLoading.set(false);
    this.isEmpty.set(true);
    this.loadError.set(null);
  }
}

function parseUtcTicks(value: string | null | undefined): bigint | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const parts = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!parts) {
    return undefined;
  }

  // DateTime usa passos de 100 ns. Campos UTC sem sufixo também são tratados como UTC.
  const [, seconds, fraction = '', offset = 'Z'] = parts;
  const millis = Date.parse(seconds + offset);
  return Number.isFinite(millis)
    ? BigInt(millis) * 10_000n + BigInt(fraction.padEnd(7, '0'))
    : undefined;
}

function resolveHubUrl(apiBaseUrl: string): string {
  const base = apiBaseUrl.replace(/\/api\/?$/i, '');
  return `${base}${HUB_PATH}`;
}
