import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth';
import { DEFAULT_USER_AVATAR, UserAvatarService } from './user-avatar.service';

describe('UserAvatarService', () => {
  let auth: AuthService;
  let avatar: UserAvatarService;
  let http: HttpTestingController;
  let createObjectUrl: ReturnType<typeof vi.spyOn>;
  let revokeObjectUrl: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    auth = TestBed.inject(AuthService);
    avatar = TestBed.inject(UserAvatarService);
    http = TestBed.inject(HttpTestingController);
    createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar-1');
    revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    TestBed.flushEffects();
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });

  it('carrega uma URL compartilhada e não repete o GET para atualizações da mesma conta', () => {
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();

    http.expectOne('/api/Me/foto').flush(new Blob(['foto']));
    expect(avatar.avatarUrl()).toBe('blob:avatar-1');

    auth.user.set({ ...auth.user()!, nome: 'Ana Silva' });
    TestBed.flushEffects();
    expect(http.match('/api/Me/foto')).toHaveLength(0);
    expect(createObjectUrl).toHaveBeenCalledOnce();
  });

  it('usa o ícone padrão ao receber 404 e não tenta novamente automaticamente', () => {
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();

    http.expectOne('/api/Me/foto').flush(new Blob(), { status: 404, statusText: 'Not Found' });
    expect(avatar.avatarUrl()).toBe(DEFAULT_USER_AVATAR);
    expect(http.match('/api/Me/foto')).toHaveLength(0);
  });

  it('remove a foto anterior se uma recarga confirmada retornar 404', () => {
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();
    http.expectOne('/api/Me/foto').flush(new Blob(['foto anterior']));

    avatar.reloadCurrentUserPhoto();
    http.expectOne('/api/Me/foto').flush(new Blob(), { status: 404, statusText: 'Not Found' });

    expect(avatar.avatarUrl()).toBe(DEFAULT_USER_AVATAR);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:avatar-1');
  });

  it('atualiza após recarga e volta ao ícone padrão se a object URL falhar', () => {
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();
    http.expectOne('/api/Me/foto').flush(new Blob(['foto anterior']));

    createObjectUrl.mockReturnValueOnce('blob:avatar-2');
    avatar.reloadCurrentUserPhoto();
    http.expectOne('/api/Me/foto').flush(new Blob(['foto nova']));
    expect(avatar.avatarUrl()).toBe('blob:avatar-2');
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:avatar-1');

    const image = document.createElement('img');
    image.setAttribute('src', 'blob:avatar-2');
    const error = new Event('error');
    Object.defineProperty(error, 'currentTarget', { value: image });
    avatar.onImageError(error);
    expect(avatar.avatarUrl()).toBe(DEFAULT_USER_AVATAR);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:avatar-2');
    avatar.onImageError(error);
    expect(http.match('/api/Me/foto')).toHaveLength(0);
  });

  it('limpa ao encerrar ou trocar de conta e descarta respostas obsoletas', () => {
    createObjectUrl.mockReturnValueOnce('blob:avatar-1').mockReturnValueOnce('blob:avatar-2');
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();
    http.expectOne('/api/Me/foto').flush(new Blob(['foto anterior']));

    avatar.reloadCurrentUserPhoto();
    const obsoleteRequest = http.expectOne('/api/Me/foto');
    auth.user.set(null);
    expect(avatar.avatarUrl()).toBe(DEFAULT_USER_AVATAR);
    TestBed.flushEffects();
    expect(obsoleteRequest.cancelled).toBe(true);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:avatar-1');

    auth.user.set({
      id: 'user-2',
      nome: 'Bia',
      email: 'bia@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    TestBed.flushEffects();
    const currentRequest = http.expectOne('/api/Me/foto');
    currentRequest.flush(new Blob(['foto nova']));
    expect(avatar.avatarUrl()).toBe('blob:avatar-2');
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
  });
});
