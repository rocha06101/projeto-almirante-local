import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './select.html',
  styleUrl: './select.scss',
})
export class SelectComponent {
  @Input() label!: string;
  @Input() options: { label: string; value: any }[] = [];
  @Input() icon?: string;
  @Input() arrow = false;

  arrowOpen = false;

  openArrow() {
    this.arrowOpen = true;
  }

  closeArrow() {
    this.arrowOpen = false;
  }
}




