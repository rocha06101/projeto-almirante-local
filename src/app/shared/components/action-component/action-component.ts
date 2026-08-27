import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-action-component',
  imports: [],
  templateUrl: './action-component.html',
  styleUrl: './action-component.scss',
})
export class ActionComponent {
  @Input() actionText = '';
  @Input() icon = '';
  @Input() hoverBorderColor = '';
  @Input() hoverTextColor = '';
}

