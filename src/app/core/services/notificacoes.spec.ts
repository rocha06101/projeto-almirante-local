import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { WritableSignal, signal } from '@angular/core';
import { HubConnectionState } from '@microsoft/signalr';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { MarcarTodasLeiturasResponse, NotificacoesPendentesResponse } from '../models/notificacao.model';
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
  let auth: { user: WritableSignal<{ id: string }>; isLoggedIn: WritableSignal<boolean>; accessTokenForSignalR: ReturnType<typeof vi.fn> };
  let api: { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };
  let response: NotificacoesPendentesResponse;
  let http: HttpTestingController;

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
      user: signal({ id: 'user-1' }),
      isLoggedIn: loggedIn,
      accessTokenForSignalR: vi.fn(async () => 'fresh-token'),
    };
    response = { items: [], naoLidas: 0, pageSize: 20, proximoCursor: null };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        NotificacoesService,
        { provide: AuthService, useValue: auth },
      ],
    });
    const realApi = TestBed.inject(ApiService);
    api = {
      get: vi.spyOn(realApi, 'get').mockImplementation(() => of(response)),
      post: vi.spyOn(realApi, 'post'),
    };
    service = TestBed.inject(NotificacoesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(async () => {
    http.verify();
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

    response = { ...response, items: [payload.notificacao], naoLidas: 1 };
    notify?.(payload);
    notify?.(payload);
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));

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
  it.each([0, 1, 20, 25])('aceita a resposta de um único POST sem corpo para %i pendências', async total => {
    response = {
      ...response,
      items: Array.from({ length: Math.min(20, total) }, (_, id) => ({
        id: String(id), criadaEmUtc: '2026-11-18T12:00:00Z',
      })),
      naoLidas: total,
    };
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    expect(service.unreadCount()).toBe(total);

    const result = { marcadas: total, naoLidas: 0, limiteUtc: '2026-11-18T13:00:00Z' };
    response = { ...response, items: [], naoLidas: 0 };

    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    const request = http.expectOne({ url: '/api/Notificacoes/Leitura/Todas', method: 'POST' });
    expect(request.request.body).toBeNull();
    request.flush(result);

    await expect(clearing).resolves.toEqual(result);
    expect(api.post).toHaveBeenCalledOnce();
    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
    expect(service.isEmpty()).toBe(true);
  });

  it('mantém o estado quando o POST devolve um corpo inválido', async () => {
    response = { ...response, items: [{ id: 'pending' }], naoLidas: 1 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));

    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush({ marcadas: 1 });
    await expect(clearing).rejects.toThrow('Resposta inválida');

    expect(service.notifications()).toEqual(response.items);
    expect(service.unreadCount()).toBe(1);
    expect(api.get).toHaveBeenCalledOnce();
  });

  it('preserva uma notificação criada durante o lote e ignora uma listagem anterior ao commit', async () => {
    const oldItem = { id: 'old', criadaEmUtc: '2026-11-18T12:00:00Z' };
    const newItem = { id: 'new', criadaEmUtc: '2026-11-18T13:00:00.0000002Z' };
    response = { ...response, items: [oldItem], naoLidas: 1 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));

    const batch = new Subject<MarcarTodasLeiturasResponse>();
    const staleList = new Subject<NotificacoesPendentesResponse>();
    api.post.mockReturnValue(batch);
    api.get.mockReturnValueOnce(staleList);
    const reconnected = signalrMocks.connection.onreconnected.mock.calls[0][0] as () => void;
    reconnected();
    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    signalrMocks.connection.handlers.get('NotificacaoCriada')?.({ notificacao: newItem, naoLidas: 2 });
    expect(api.get).toHaveBeenCalledTimes(2);

    batch.next({ marcadas: 1, naoLidas: 1, limiteUtc: '2026-11-18T13:00:00.0000001Z' });
    await clearing;
    expect(service.notifications()).toEqual([newItem]);
    response = { ...response, items: [newItem], naoLidas: 1 };
    staleList.next({ ...response, items: [oldItem], naoLidas: 40 });

    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    expect(service.notifications()).toEqual([newItem]);
    expect(service.unreadCount()).toBe(1);
    expect(service.isEmpty()).toBe(false);
  });

  it('aplica o corte inclusivo de 100 ns e mantém o contador do POST se a consulta falhar', async () => {
    const before = { id: 'before', criadaEmUtc: '2026-11-18T13:00:00.1234566' };
    const atLimit = { id: 'at-limit', criadaEmUtc: '2026-11-18T10:00:00.1234567-03:00' };
    const after = { id: 'after', criadaEmUtc: '2026-11-18T13:00:00.1234568Z' };
    response = { ...response, items: [before, atLimit], naoLidas: 25 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(25));

    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    const created = signalrMocks.connection.handlers.get('NotificacaoCriada');
    created?.({ notificacao: after, naoLidas: 26 });
    const unavailable = throwError(() => new HttpErrorResponse({ status: 503 }));
    api.get.mockReturnValueOnce(unavailable).mockReturnValueOnce(unavailable);
    const result = { marcadas: 25, naoLidas: 1, limiteUtc: '2026-11-18T13:00:00.1234567Z' };
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush(result);

    await expect(clearing).resolves.toEqual(result);
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    created?.({ notificacao: before, naoLidas: 26 });
    created?.({ notificacao: atLimit, naoLidas: 26 });
    expect(service.notifications()).toEqual([after]);
    expect(service.unreadCount()).toBe(1);
    expect(service.loadError()).toBeNull();
  });

  it('preserva o estado se o POST falhar e permite repetir o lote', async () => {
    response = { ...response, items: [{ id: 'pending', criadaEmUtc: '2026-11-18T13:00:00Z' }], naoLidas: 1 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));

    const failed = firstValueFrom(service.marcarTodasComoLidas());
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush(null, {
      status: 503, statusText: 'Service Unavailable',
    });
    await expect(failed).rejects.toMatchObject({ status: 503 });
    expect(service.notifications()).toEqual(response.items);
    expect(service.unreadCount()).toBe(1);
    expect(api.get).toHaveBeenCalledOnce();

    response = { ...response, items: [], naoLidas: 0 };
    const retried = firstValueFrom(service.marcarTodasComoLidas());
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush({
      marcadas: 1, naoLidas: 0, limiteUtc: '2026-11-18T13:00:00Z',
    });
    await retried;
    expect(service.unreadCount()).toBe(0);
    expect(service.notifications()).toEqual([]);
  });

  it('mantém o total confirmado pelo lote se a listagem vier sem naoLidas', async () => {
    response = { ...response, naoLidas: 25 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(25));

    api.get.mockReturnValueOnce(of({ items: [] }));
    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush({
      marcadas: 25, naoLidas: 1, limiteUtc: '2026-11-18T13:00:00Z',
    });
    await clearing;
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(service.unreadCount()).toBe(1);
  });

  it('reconcilia a outra aba por REST e ignora eventos de leitura duplicados com contador antigo', async () => {
    response = { ...response, items: [{ id: 'first' }, { id: 'second' }], naoLidas: 22 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(22));
    const read = signalrMocks.connection.handlers.get('NotificacaoLida');
    response = { ...response, items: [{ id: 'new' }], naoLidas: 1 };
    api.get.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 0 })));
    read?.({ notificacaoId: 'second', naoLidas: 0 });
    read?.({ notificacaoId: 'first', naoLidas: 7 });
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));
    const requests = api.get.mock.calls.length;
    read?.({ notificacaoId: 'second', naoLidas: 0 });

    expect(api.get).toHaveBeenCalledTimes(requests);
    expect(service.notifications()).toEqual(response.items);
    expect(service.unreadCount()).toBe(1);
  });

  it('continua marcando uma notificação individual pelo ID', async () => {
    const item = { id: 'individual' };
    response = { ...response, items: [item], naoLidas: 1 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));
    response = { ...response, items: [], naoLidas: 0 };
    const result = { notificacao: item, naoLidas: 0 };
    api.post.mockReturnValue(of(result));

    await expect(firstValueFrom(service.marcarComoLida(item.id))).resolves.toEqual(result);
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/Notificacoes/individual/Leitura', {});
    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
  });

  it('ignora o contador de uma leitura individual iniciada antes do lote mesmo se o GET falhar', async () => {
    const item = { id: 'individual', criadaEmUtc: '2026-11-18T12:00:00Z' };
    response = { ...response, items: [item], naoLidas: 25 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(25));

    const individual = firstValueFrom(service.marcarComoLida(item.id));
    const clearing = firstValueFrom(service.marcarTodasComoLidas());
    api.get.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    http.expectOne('/api/Notificacoes/Leitura/Todas').flush({
      marcadas: 24, naoLidas: 0, limiteUtc: '2026-11-18T13:00:00Z',
    });
    await clearing;
    http.expectOne('/api/Notificacoes/individual/Leitura').flush({ notificacao: item, naoLidas: 24 });
    await individual;

    expect(service.unreadCount()).toBe(0);
    expect(service.notifications()).toEqual([]);
  });

  it('descarta a leitura individual assim que o logout encerra a conexão', async () => {
    response = { ...response, items: [{ id: 'individual' }], naoLidas: 1 };
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));
    const next = vi.fn();
    const complete = vi.fn();
    service.marcarComoLida('individual').subscribe({ next, complete });

    await service.stopRealtime();
    // O fluxo de logout encerra o hub antes de limpar a sessão de autenticação.
    expect(loggedIn()).toBe(true);
    http.expectOne('/api/Notificacoes/individual/Leitura').flush({
      notificacao: { id: 'individual' }, naoLidas: 24,
    });

    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(api.get).toHaveBeenCalledOnce();
    expect(service.notifications()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
  });

  it('descarta a resposta do lote depois do logout e de uma nova sessão', async () => {
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledOnce());
    const batch = new Subject<MarcarTodasLeiturasResponse>();
    api.post.mockReturnValue(batch);
    const next = vi.fn();
    const complete = vi.fn();
    service.marcarTodasComoLidas().subscribe({ next, complete });
    loggedIn.set(false);
    await vi.waitFor(() => expect(signalrMocks.connection.stop).toHaveBeenCalledOnce());

    response = { ...response, items: [{ id: 'other-user' }], naoLidas: 1 };
    auth.user.set({ id: 'user-2' });
    loggedIn.set(true);
    await vi.waitFor(() => expect(service.unreadCount()).toBe(1));

    batch.next({ marcadas: 2, naoLidas: 0, limiteUtc: '2026-11-18T13:00:00Z' });
    batch.complete();

    expect(next).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(service.notifications()).toEqual(response.items);
    expect(service.unreadCount()).toBe(1);
  });

});
