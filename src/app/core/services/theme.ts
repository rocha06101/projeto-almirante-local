import { Injectable, signal, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'app-theme';
  
  currentTheme = signal<ThemeMode>(this.getInitialTheme());

  constructor() {
    // Atualizar o tema quando o sinal mudar
    effect(() => {
      this.applyTheme(this.currentTheme());
    });
  }

  private getInitialTheme(): ThemeMode {
    // Verificar localStorage
    const savedTheme = localStorage.getItem(this.THEME_KEY) as ThemeMode | null;
    if (savedTheme) {
      return savedTheme;
    }

    // Verificar preferência do sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }

    return 'light';
  }

  private applyTheme(theme: ThemeMode): void {
    const htmlElement = document.documentElement;
    
    if (theme === 'dark') {
      htmlElement.setAttribute('data-theme', 'dark');
      htmlElement.classList.add('dark-mode');
      htmlElement.classList.remove('light-mode');
    } else {
      htmlElement.setAttribute('data-theme', 'light');
      htmlElement.classList.add('light-mode');
      htmlElement.classList.remove('dark-mode');
    }

    // Salvar preferência
    localStorage.setItem(this.THEME_KEY, theme);
  }

  toggleTheme(): void {
    this.currentTheme.update(theme => theme === 'light' ? 'dark' : 'light');
  }

  setTheme(theme: ThemeMode): void {
    this.currentTheme.set(theme);
  }

  isDark(): boolean {
    return this.currentTheme() === 'dark';
  }
}
