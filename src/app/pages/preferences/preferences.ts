import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ThemePreference, ThemeService } from '../../core/services/theme';
import { ThemeOption } from '../../shared/components/theme-option/theme-option';
import { ToggleSwitch } from '../../shared/components/toggle-switch/toggle-switch';

type Density = 'comfortable' | 'compact';

@Component({
  selector: 'app-preferences',
  imports: [ReactiveFormsModule, ThemeOption, ToggleSwitch],
  templateUrl: './preferences.html',
  styleUrl: './preferences.scss',
})
export class Preferences {
  protected readonly theme = inject(ThemeService);

  protected readonly themes = [
    { value: 'light', label: 'Claro' },
    { value: 'dark', label: 'Escuro' },
    { value: 'system', label: 'Automático' },
  ] as const;

  protected readonly previewDescriptions: Record<ThemePreference, string> = {
    light: 'Veja como o Almirante aparece no tema claro.',
    dark: 'Veja como o Almirante aparece no tema escuro.',
    system: 'A aparência acompanha o tema do seu dispositivo.',
  };

  protected readonly notifications = new FormControl(true, { nonNullable: true });
  protected readonly density = new FormControl<Density>('comfortable', { nonNullable: true });
  protected readonly reduceMotion = new FormControl(false, { nonNullable: true });

  protected readonly categories = [
    { icon: 'calendar-alert-outline', label: 'Eventos e atividades', description: 'Lembretes e novidades sobre eventos.' },
    { icon: 'wallet-icon', label: 'Financeiro', description: 'Avisos de cobranças e pagamentos.' },
    { icon: 'letter', label: 'Comunicados', description: 'Informações e avisos do clube.' },
    { icon: 'warehouse-icon', label: 'Patrimônio', description: 'Atualizações sobre bens e reservas.' },
  ].map((category) => ({
    ...category,
    control: new FormControl(true, { nonNullable: true }),
  }));

  constructor() {
    this.notifications.valueChanges.pipe(takeUntilDestroyed()).subscribe((enabled) => {
      for (const { control } of this.categories) {
        if (enabled) {
          control.enable();
        } else {
          control.disable();
        }
      }
    });
  }

  protected restoreDefaults(): void {
    this.theme.setTheme('system');
    this.notifications.reset();
    for (const { control } of this.categories) {
      control.reset();
    }
    this.density.reset();
    this.reduceMotion.reset();
  }
}
