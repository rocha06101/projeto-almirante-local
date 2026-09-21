import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UpdateBannerComponent } from './shared/components/update-banner/update-banner';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, UpdateBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('almirante-tamandare-frontend');
}
