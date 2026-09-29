import { Component, inject } from '@angular/core';
import { PwaUpdateService } from '../../../core/pwa/pwa-update.service';

@Component({
  selector: 'app-update-banner',
  standalone: true,
  templateUrl: './update-banner.html',
  styleUrl: './update-banner.scss',
})
export class UpdateBannerComponent {
  protected readonly updates = inject(PwaUpdateService);
}
