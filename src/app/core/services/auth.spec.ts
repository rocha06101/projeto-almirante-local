import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { authInterceptor } from '../interceptors/auth-interceptor';
import { AuthService } from './auth';

const expiresIn = (ms: number) => new Date(Date.now() + ms).toISOString();
const tokenBody = (accessToken = 'jwt-1', ms = 3_600_000) => ({ token: { accessToken, expiresAtUtc: expiresIn(ms) } });
const me = { id: '1', nome: 'Maria', email: 'maria@example.com', cargo: { id: 'c', nome: 'Diretoria', role: 'Diretor' } };

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  /** As chamadas encadeiam-se de forma assíncrona (Web Locks/promessas): espera a próxima requisição. */
  const next = (path: string, method = 'GET'): Promise<TestRequest> =>
    vi.waitFor(() => {
      const found = http.match(r => r.url === `/api${path}` && r.method === method);
      expect(found, `${method} ${path}`).toHaveLength(1);
      return found[0];
    });

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('remove o token legado do localStorage', () => {
    localStorage.setItem('auth_token', 'antigo');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    TestBed.inject(AuthService);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('login: busca CSRF, envia X-CSRF-TOKEN com credenciais, guarda o token só em memória e carrega o perfil', async () => {
    const done = firstValueFrom(auth.login('maria@example.com', 'segredo'));

    const csrf = await next('/Auth/csrf');
    expect(csrf.request.headers.has('Authorization')).toBe(false);
    csrf.flush({ csrfToken: 'csrf-1' });

    const login = await next('/Auth/login', 'POST');
    expect(login.request.headers.get('X-CSRF-TOKEN')).toBe('csrf-1');
    expect(login.request.withCredentials).toBe(true);
    expect(login.request.headers.has('Authorization')).toBe(false);
    expect(login.request.body).toEqual({ email: 'maria@example.com', senha: 'segredo' });
    login.flush(tokenBody('jwt-1'));

    const profile = await next('/Auth/Me');
    expect(profile.request.headers.get('Authorization')).toBe('Bearer jwt-1');
    profile.flush(me);

    await expect(done).resolves.toEqual(me);
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.user()?.nome).toBe('Maria');
    expect(JSON.stringify({ ...localStorage })).not.toContain('jwt-1');
  });

  it('validateSession sem sessão: tenta refresh com CSRF e retorna false no 401', async () => {
    const done = firstValueFrom(auth.validateSession());

    (await next('/Auth/csrf')).flush({ csrfToken: 'csrf-2' });
    const refresh = await next('/Auth/refresh', 'POST');
    expect(refresh.request.headers.get('X-CSRF-TOKEN')).toBe('csrf-2');
    refresh.flush({ title: 'Credenciais inválidas.' }, { status: 401, statusText: 'Unauthorized' });

    await expect(done).resolves.toBe(false);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('validateSession restaura a sessão pelo cookie de refresh e carrega /Me', async () => {
    const done = firstValueFrom(auth.validateSession());

    (await next('/Auth/csrf')).flush({ csrfToken: 'csrf-3' });
    (await next('/Auth/refresh', 'POST')).flush(tokenBody('jwt-2'));
    const profile = await next('/Auth/Me');
    expect(profile.request.headers.get('Authorization')).toBe('Bearer jwt-2');
    profile.flush(me);

    await expect(done).resolves.toBe(true);
    expect(auth.accessToken()).toBe('jwt-2');
  });

  it('logout autenticado: pede CSRF COM Bearer, envia X-CSRF-TOKEN e limpa a sessão', async () => {
    const login = firstValueFrom(auth.login('maria@example.com', 'segredo'));
    (await next('/Auth/csrf')).flush({ csrfToken: 'a' });
    (await next('/Auth/login', 'POST')).flush(tokenBody('jwt-3'));
    (await next('/Auth/Me')).flush(me);
    await login;

    const done = firstValueFrom(auth.logout());

    const csrf = await next('/Auth/csrf');
    expect(csrf.request.headers.get('Authorization')).toBe('Bearer jwt-3');
    csrf.flush({ csrfToken: 'b' });

    const logout = await next('/Auth/logout', 'POST');
    expect(logout.request.headers.get('X-CSRF-TOKEN')).toBe('b');
    expect(logout.request.headers.get('Authorization')).toBe('Bearer jwt-3');
    logout.flush(null, { status: 204, statusText: 'No Content' });

    await done;
    expect(auth.accessToken()).toBeNull();
    expect(auth.user()).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('logout limpa a sessão local mesmo quando a API falha', async () => {
    const done = firstValueFrom(auth.logout());
    (await next('/Auth/csrf')).flush('erro', { status: 500, statusText: 'Server Error' });
    await done;
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('refreshSession compartilha uma única renovação entre chamadas simultâneas', async () => {
    const a = firstValueFrom(auth.refreshSession());
    const b = firstValueFrom(auth.refreshSession());

    (await next('/Auth/csrf')).flush({ csrfToken: 'c' });
    (await next('/Auth/refresh', 'POST')).flush(tokenBody('jwt-4'));

    await expect(Promise.all([a, b])).resolves.toEqual(['jwt-4', 'jwt-4']);
  });
});
