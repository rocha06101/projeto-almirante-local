import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth';
import { NotificacoesService } from '../../../core/services/notificacoes';
import { TopbarComponent } from './topbar';

describe('TopbarComponent avatar', () => {
  let fixture: ComponentFixture<TopbarComponent>;
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotificacoesService,
          useValue: {
            notifications: signal([]),
            unreadCount: signal(0),
            isLoading: signal(false),
            isEmpty: signal(true),
            loadError: signal(null),
            stopRealtime: vi.fn(),
            marcarComoLida: vi.fn(),
            confirmarLeitura: vi.fn(),
            removerNotificacaoInexistente: vi.fn(),
          },
        },
      ],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shared-avatar');
    auth.user.set({
      id: 'user-1',
      nome: 'Ana',
      email: 'ana@example.com',
      cargo: { id: 'c', nome: 'Diretora', role: 'R' },
    });
    fixture = TestBed.createComponent(TopbarComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify({ ignoreCancelled: true });
    vi.restoreAllMocks();
  });

  it('mostra a mesma foto nos dois avatares e não recarrega ao abrir e fechar o menu', () => {
    http.expectOne('/api/Me/foto').flush(new Blob(['foto']));
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    const smallAvatar = page.querySelector<HTMLImageElement>('.profile-btn .avatar');
    expect(smallAvatar?.getAttribute('src')).toBe('blob:shared-avatar');

    page.querySelector<HTMLButtonElement>('.profile-btn')?.click();
    fixture.detectChanges();
    const largeAvatar = page.querySelector<HTMLImageElement>('.large-avatar');
    expect(largeAvatar?.getAttribute('src')).toBe(smallAvatar?.getAttribute('src'));

    page.querySelector<HTMLButtonElement>('.profile-btn')?.click();
    fixture.detectChanges();
    page.querySelector<HTMLButtonElement>('.profile-btn')?.click();
    fixture.detectChanges();
    expect(page.querySelector<HTMLImageElement>('.large-avatar')?.getAttribute('src')).toBe('blob:shared-avatar');
    expect(http.match('/api/Me/foto')).toHaveLength(0);
  });
});
