import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { authInterceptor } from './auth-interceptor';
import { AuthService } from '../services/auth';

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let auth: AuthService;

  const next = (path: string, method = 'GET'): Promise<TestRequest> =>
    vi.waitFor(() => {
      const found = http.match(r => r.url === path && r.method === method);
      expect(found, `${method} ${path}`).toHaveLength(1);
      return found[0];
    });

  const tokenBody = (accessToken: string) => ({
    token: { accessToken, expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString() },
  });

  const signIn = async (token = 'jwt-x') => {
    const done = firstValueFrom(auth.login('a@b.co', 'x'));
    (await next('/api/Auth/csrf')).flush({ csrfToken: 'c' });
    (await next('/api/Auth/login', 'POST')).flush(tokenBody(token));
    (await next('/api/Auth/Me')).flush({ id: '1', nome: 'N', email: 'e', cargo: { id: 'c', nome: 'C', role: 'R' } });
    await done;
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), provideRouter([])],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => http.verify());

  it('não anexa Bearer nem cookies em requisições para fora da API', () => {
    client.get('https://example.org/dados').subscribe();
    const req = http.expectOne('https://example.org/dados');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.withCredentials).toBe(false);
    req.flush({});
  });

  it('anexa Bearer e credenciais às chamadas da API quando há sessão', async () => {
    await signIn('jwt-x');

    client.get('/api/Usuarios').subscribe();
    const req = http.expectOne('/api/Usuarios');
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt-x');
    expect(req.request.withCredentials).toBe(true);
    req.flush([]);
  });

  it('em 401 renova a sessão uma vez e repete a requisição com o novo token', async () => {
    await signIn('jwt-velho');

    const result = firstValueFrom(client.get<string[]>('/api/Usuarios'));
    (await next('/api/Usuarios')).flush({}, { status: 401, statusText: 'Unauthorized' });

    (await next('/api/Auth/csrf')).flush({ csrfToken: 'c2' });
    (await next('/api/Auth/refresh', 'POST')).flush(tokenBody('jwt-novo'));

    const retry = await next('/api/Usuarios');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer jwt-novo');
    retry.flush(['ok']);

    await expect(result).resolves.toEqual(['ok']);
  });

  it('em 403 não encerra a sessão nem tenta renovar', async () => {
    await signIn();

    const result = firstValueFrom(client.get('/api/Usuarios')).catch(e => e);
    (await next('/api/Usuarios')).flush({}, { status: 403, statusText: 'Forbidden' });

    expect((await result).status).toBe(403);
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('se a renovação for recusada (401), encerra a sessão local', async () => {
    await signIn();
    const expire = vi.spyOn(auth, 'expireSession').mockImplementation(() => undefined);

    const result = firstValueFrom(client.get('/api/Usuarios')).catch(e => e);
    (await next('/api/Usuarios')).flush({}, { status: 401, statusText: 'Unauthorized' });
    (await next('/api/Auth/csrf')).flush({ csrfToken: 'c3' });
    (await next('/api/Auth/refresh', 'POST')).flush({}, { status: 401, statusText: 'Unauthorized' });

    await result;
    expect(expire).toHaveBeenCalled();
  });
});
