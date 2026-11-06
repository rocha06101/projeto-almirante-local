import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-refresh-button',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './refresh-button.html',
  styleUrl: './refresh-button.scss',
})
export class RefreshButton {
  @Input() type: HTMLButtonElement['type'] = 'button';
  @Input() disabled = false;
  @Input() routerLink: RouterLink['routerLink'] = null;
}
