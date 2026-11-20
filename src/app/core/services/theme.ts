import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

const THEME_KEY = 'app-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly media = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media?.matches ?? false);
  private readonly preferenceState = signal(this.readPreference());

  readonly preference = this.preferenceState.asReadonly();
  readonly currentTheme = computed<ThemeMode>(() => {
    const preference = this.preference();
    return preference === 'system' ? (this.systemDark() ? 'dark' : 'light') : preference;
  });

  constructor() {
    const updateSystemTheme = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    this.media?.addEventListener('change', updateSystemTheme);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', updateSystemTheme));

effect(() => {
  const theme = this.currentTheme();
  const root = this.document.documentElement;

  root.setAttribute('data-theme', theme);
  root.classList.toggle('dark-mode', theme === 'dark');
  root.classList.toggle('light-mode', theme === 'light');

  root.style.colorScheme = theme;
  root.style.backgroundColor =
    theme === 'dark' ? '#111827' : '#F0F4F7';
});
  }

  toggleTheme(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark');
  }

  setTheme(theme: ThemePreference): void {
    this.preferenceState.set(theme);

    try {
      this.document.defaultView?.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // A seleção continua disponível em memória quando o armazenamento é bloqueado.
    }
  }

  isDark(): boolean {
    return this.currentTheme() === 'dark';
  }

  private readPreference(): ThemePreference {
    try {
      const saved = this.document.defaultView?.localStorage.getItem(THEME_KEY);
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  }
}
