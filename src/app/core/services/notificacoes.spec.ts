import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { of } from 'rxjs';
import { ApiService } from './api';
import { AuthService } from './auth';
import { NotificacoesService } from './notificacoes';

const signalrMocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    connection: {
      state: 'Disconnected' as string,
      handlers,
      on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers.set(event, handler);
      }),
      onreconnected: vi.fn(),
      onclose: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    },
    withUrl: vi.fn(),
  };
});

vi.mock('@microsoft/signalr', () => ({
  HubConnectionState: { Disconnected: 'Disconnected' },
  HubConnectionBuilder: class {
    withUrl = vi.fn((url: string, options: unknown) => {
      signalrMocks.withUrl(url, options);
      return this;
    });

    withAutomaticReconnect = vi.fn(() => this);

    build() {
      return signalrMocks.connection;
    }
  },
}));

describe('NotificacoesService realtime', () => {
  let service: NotificacoesService;
  let loggedIn: WritableSignal<boolean>;
  let auth: { isLoggedIn: WritableSignal<boolean>; accessTokenForSignalR: ReturnType<typeof vi.fn> };
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let response: { items: { id: string; titulo: string }[]; naoLidas: number; pageSize: number; proximoCursor: null };

  beforeEach(() => {
    signalrMocks.connection.state = HubConnectionState.Disconnected;
    signalrMocks.connection.handlers.clear();
    signalrMocks.connection.on.mockClear();
    signalrMocks.connection.onreconnected.mockClear();
    signalrMocks.connection.onclose.mockClear();
    signalrMocks.connection.start.mockReset().mockImplementation(async () => {
      signalrMocks.connection.state = 'Connected';
    });
    signalrMocks.connection.stop.mockReset().mockImplementation(async () => {
      signalrMocks.connection.state = HubConnectionState.Disconnected;
    });
    signalrMocks.withUrl.mockClear();

    loggedIn = signal(true);
    auth = {
      isLoggedIn: loggedIn,
      accessTokenForSignalR: vi.fn(async () => 'fresh-token'),
    };
    response = { items: [], naoLidas: 0, pageSize: 20, proximoCursor: null };
    api = {
      get: vi.fn(() => of(response)),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        NotificacoesService,
        { provide: AuthService, useValue: auth },
        { provide: ApiService, useValue: api },
      ],
    });
    service = TestBed.inject(NotificacoesService);
  });

  afterEach(async () => {
    await service.stopRealtime();
    TestBed.resetTestingModule();
  });

  it('registra os handlers antes de iniciar e sincroniza as pendências pela API REST', async () => {
    await vi.waitFor(() => expect(signalrMocks.connection.start).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledOnce());

    expect(signalrMocks.connection.on.mock.invocationCallOrder[0]).toBeLessThan(
      signalrMocks.connection.start.mock.invocationCallOrder[0],
    );
    expect(api.get).toHaveBeenCalledWith('/Notificacoes/Pendentes', {
      params: { pageSize: 20 },
    });
    expect(signalrMocks.withUrl).toHaveBeenCalledWith(
      '/hubs/notificacoes',
      expect.objectContaining({ accessTokenFactory: expect.any(Function) }),
    );

    const options = signalrMocks.withUrl.mock.calls[0][1] as {
      accessTokenFactory: () => Promise<string>;
    };
    await expect(options.accessTokenFactory()).resolves.toBe('fresh-token');
    expect(auth.accessTokenForSignalR).toHaveBeenCalledOnce();
  });

  it('adiciona NotificacaoCriada e deduplica pelo ID sem perder o contador atualizado', async () => {
    await vi.waitFor(() => expect(signalrMocks.connection.start).toHaveBeenCalledOnce());
    const notify = signalrMocks.connection.handlers.get('NotificacaoCriada');
    const payload = {
      notificacao: { id: 'n-1', titulo: 'Novo evento' },
      naoLidas: 1,
    };

    notify?.(payload);
    notify?.(payload);

    expect(service.notifications()).toEqual([payload.notificacao]);
    expect(service.unreadCount()).toBe(1);
  });

  it('remove NotificacaoLida e ignora uma criação posterior do mesmo ID', async () => {
    await vi.waitFor(() => expect(signalrMocks.connection.start).toHaveBeenCalledOnce());
    const created = signalrMocks.connection.handlers.get('NotificacaoCriada');
    const read = signalrMocks.connection.handlers.get('NotificacaoLida');

    created?.({ notificacao: { id: 'n-2', titulo: 'Aviso' }, naoLidas: 1 });
    read?.({ notificacaoId: 'n-2', lidaEmUtc: '2026-11-05T12:00:00Z', naoLidas: 0 });
    created?.({ notificacao: { id: 'n-2', titulo: 'Aviso' }, naoLidas: 0 });

    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
    expect(service.isEmpty()).toBe(true);
  });

  it('consulta novamente a API depois da reconexão', async () => {
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    response = {
      items: [{ id: 'n-3', titulo: 'Chegou durante a desconexão' }],
      naoLidas: 1,
      pageSize: 20,
      proximoCursor: null,
    };

    const reconnected = signalrMocks.connection.onreconnected.mock.calls[0][0] as () => void;
    reconnected();
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(service.notifications()).toEqual(response.items));

    expect(service.unreadCount()).toBe(1);
  });

  it('encerra a conexão quando a sessão autenticada termina', async () => {
    await vi.waitFor(() => expect(signalrMocks.connection.start).toHaveBeenCalledOnce());

    loggedIn.set(false);

    await vi.waitFor(() => expect(signalrMocks.connection.stop).toHaveBeenCalledOnce());
    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
  });
});
