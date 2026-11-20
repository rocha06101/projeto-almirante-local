import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme';
import { ToastComponent } from './shared/components/toast/toast';
import { UpdateBannerComponent } from './shared/components/update-banner/update-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBannerComponent, ToastComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('almirante-tamandare-frontend');
  constructor() {
    inject(ThemeService);
  }
}
