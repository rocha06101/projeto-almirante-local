
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme';

describe('ThemeService', () => {
  let service: ThemeService;
  let document: Document;
  let storage: Storage;
  let systemDark = false;
  let systemChange: ((event: MediaQueryListEvent) => void) | undefined;

  beforeEach(() => {
    systemDark = false;
    systemChange = undefined;

    const media = {
      matches: false,
      addEventListener: vi.fn(
        (_type: string, listener: (event: MediaQueryListEvent) => void) => {
          systemChange = listener;
        }
      ),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('matchMedia', vi.fn(() => media));

    TestBed.configureTestingModule({});
    document = TestBed.inject(DOCUMENT);
    storage = document.defaultView!.localStorage;
    storage.removeItem('app-theme');

    service = TestBed.inject(ThemeService);
    TestBed.flushEffects();
  });

  afterEach(() => {
    storage.removeItem('app-theme');
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('usa o tema do sistema quando não existe preferência salva', () => {
    expect(service.preference()).toBe('system');
    expect(service.currentTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('alterna entre os temas claro e escuro', () => {
    service.setTheme('dark');
    TestBed.flushEffects();

    expect(service.currentTheme()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.classList.contains('dark-mode')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    service.toggleTheme();
    TestBed.flushEffects();

    expect(service.currentTheme()).toBe('light');
    expect(service.isDark()).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.classList.contains('light-mode')).toBe(true);
  });

  it('salva a preferência no localStorage', () => {
    service.setTheme('dark');

    expect(storage.getItem('app-theme')).toBe('dark');
    expect(service.preference()).toBe('dark');
  });

  it('acompanha alterações do tema do sistema no modo automático', () => {
    service.setTheme('system');

    systemDark = true;
    systemChange?.({ matches: systemDark } as MediaQueryListEvent);
    TestBed.flushEffects();

    expect(service.currentTheme()).toBe('dark');

    systemDark = false;
    systemChange?.({ matches: systemDark } as MediaQueryListEvent);
    TestBed.flushEffects();

    expect(service.currentTheme()).toBe('light');
  });

  it('ignora preferências inválidas no localStorage', () => {
  storage.setItem('app-theme', 'blue');

  const novoServico = TestBed.runInInjectionContext(
    () => new ThemeService()
  );

  expect(novoServico.preference()).toBe('system');
  expect(novoServico.currentTheme()).toBe('light');
});

it('continua funcionando quando o localStorage está indisponível', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('Storage bloqueado');
    });

  try {
    expect(() => service.setTheme('dark')).not.toThrow();

    TestBed.flushEffects();

    expect(service.preference()).toBe('dark');
    expect(service.currentTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  } finally {
    spy.mockRestore();
  }
});
it('usa o tema do sistema quando a leitura do localStorage falha', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem')
    .mockImplementation(() => {
      throw new Error('Leitura bloqueada');
    });

  try {
    const novoServico = TestBed.runInInjectionContext(
      () => new ThemeService()
    );

    expect(novoServico.preference()).toBe('system');
    expect(novoServico.currentTheme()).toBe('light');
  } finally {
    spy.mockRestore();
  }
});
});
