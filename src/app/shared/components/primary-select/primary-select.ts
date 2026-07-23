import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-primary-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './primary-select.html',
  styleUrl: './primary-select.scss',
})
export class PrimarySelect {
  @Input() label = 'Selecione uma opção';
  @Input() placeholder = '';
  @Input() id = 'select-field';
  @Input() options: { label: string; value: any }[] = [];
}