import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, throwError } from 'rxjs';
import { MarcarTodasLeiturasResponse } from '../../../core/models/notificacao.model';
import { ToastService } from '../../../core/services/toast.service';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/services/auth';
import { NotificacoesService } from '../../../core/services/notificacoes';
import { TopbarComponent } from './topbar';

describe('TopbarComponent', () => {
  let fixture: ComponentFixture<TopbarComponent>;
  let auth: AuthService;
  let http: HttpTestingController;
  const clear = vi.fn();
  const unreadCount = signal(0);
  const notifications = signal<{ id: string }[]>([]);

  beforeEach(() => {
    clear.mockReset();
    unreadCount.set(0);
    notifications.set([]);
    TestBed.configureTestingModule({
      imports: [TopbarComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: NotificacoesService,
          useValue: {
            notifications,
            unreadCount,
            isLoading: signal(false),
            isEmpty: signal(true),
            loadError: signal(null),
            stopRealtime: vi.fn(),
            marcarComoLida: vi.fn(),
            marcarTodasComoLidas: clear,
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
  it('não chama o serviço quando não há pendências', () => {
    http.expectOne('/api/Me/foto').flush(new Blob());
    fixture.componentInstance.clearNotifications();
    expect(clear).not.toHaveBeenCalled();
  });

  it('exibe o botão com contador positivo e lista vazia e bloqueia cliques repetidos', () => {
    http.expectOne('/api/Me/foto').flush(new Blob());
    const batch = new Subject<MarcarTodasLeiturasResponse>();
    clear.mockReturnValue(batch);
    unreadCount.set(25);
    fixture.componentInstance.toggleNotifications();
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.clear-btn')!;
    button.click();
    fixture.componentInstance.clearNotifications();
    fixture.detectChanges();

    expect(clear).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.textContent?.trim()).toBe('Limpando...');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);

    batch.next({ marcadas: 25, naoLidas: 0, limiteUtc: '2026-11-18T13:00:00Z' });
    batch.complete();
    expect(fixture.componentInstance.isClearingNotifications()).toBe(false);
    expect(TestBed.inject(ToastService).toasts()).toEqual([expect.objectContaining({ type: 'success' })]);
  });

  it.each([401, 403, 0, 503])('mantém as pendências e permite nova tentativa após erro %i', status => {
    http.expectOne('/api/Me/foto').flush(new Blob());
    notifications.set([{ id: 'pending' }]);
    unreadCount.set(1);
    clear.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));

    fixture.componentInstance.clearNotifications();
    expect(fixture.componentInstance.isClearingNotifications()).toBe(false);
    expect(notifications()).toEqual([{ id: 'pending' }]);
    expect(unreadCount()).toBe(1);
    expect(TestBed.inject(ToastService).toasts()).toEqual([expect.objectContaining({ type: 'error' })]);

    fixture.componentInstance.clearNotifications();
    expect(clear).toHaveBeenCalledTimes(2);
  });

});
