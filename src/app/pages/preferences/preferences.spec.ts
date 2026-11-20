import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Preferences } from './preferences';

describe('Preferences', () => {
  let fixture: ComponentFixture<Preferences>;
  let host: HTMLElement;
  let colorScheme: MediaQueryList;

  const radio = (value: string) => host.querySelector<HTMLInputElement>(`[type="radio"][value="${value}"]`)!;
  const switches = () => Array.from(host.querySelectorAll<HTMLInputElement>('input[role="switch"]'));
  const preview = () => host.querySelector('.large-preview')!;
  const restore = () => host.querySelector<HTMLButtonElement>('.restore-button')!.click();

  beforeEach(async () => {
    localStorage.removeItem('app-theme');
    colorScheme = Object.assign(new EventTarget(), { matches: false }) as MediaQueryList;
    vi.stubGlobal('matchMedia', vi.fn(() => colorScheme));
    await TestBed.configureTestingModule({ imports: [Preferences] }).compileComponents();
    fixture = TestBed.createComponent(Preferences);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem('app-theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.classList.remove('light-mode', 'dark-mode');
  });

  it('segue o sistema no modo automático e respeita a seleção explícita', async () => {
    expect(radio('system').checked).toBe(true);
    expect(preview().getAttribute('data-theme-preview')).toBe('light');

    colorScheme.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    await fixture.whenStable();
    expect(preview().getAttribute('data-theme-preview')).toBe('dark');

    radio('light').click();
    await fixture.whenStable();
    expect(radio('system').checked).toBe(false);
    expect(preview().getAttribute('data-theme-preview')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('app-theme')).toBe('light');

    restore();
    await fixture.whenStable();
    expect(radio('system').checked).toBe(true);
    expect(preview().getAttribute('data-theme-preview')).toBe('dark');
    expect(localStorage.getItem('app-theme')).toBe('system');
  });

  it('desabilita as categorias preservando a seleção até restaurar os padrões', async () => {
    const [master, events, finance, announcements, assets] = switches();
    const categories = [events, finance, announcements, assets];

    events.click();
    master.click();
    await fixture.whenStable();
    expect(categories.every((category) => category.disabled)).toBe(true);
    events.click();
    expect(events.checked).toBe(false);

    master.click();
    await fixture.whenStable();
    expect(categories.every((category) => !category.disabled)).toBe(true);
    expect(events.checked).toBe(false);
    expect(finance.checked).toBe(true);

    master.click();
    await fixture.whenStable();
    restore();
    await fixture.whenStable();
    expect(master.checked).toBe(true);
    expect(categories.every((category) => category.checked && !category.disabled)).toBe(true);
  });

  it('aplica densidade à prévia e redução de movimento à tela, com restauração', async () => {
    const motion = switches().at(-1)!;

    radio('compact').click();
    motion.click();
    await fixture.whenStable();
    expect(preview().classList.contains('compact-preview')).toBe(true);
    expect(host.querySelector('.preferences')?.classList.contains('reduce-motion')).toBe(true);

    restore();
    await fixture.whenStable();
    expect(radio('comfortable').checked).toBe(true);
    expect(preview().classList.contains('compact-preview')).toBe(false);
    expect(motion.checked).toBe(false);
    expect(host.querySelector('.preferences')?.classList.contains('reduce-motion')).toBe(false);
  });
});
