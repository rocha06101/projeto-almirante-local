import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextPrimarySelectId = 0;

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
  /** Se omitido, gera um id único para associar label e campo. */
  @Input() id = `primary-select-${nextPrimarySelectId++}`;
  @Input() options: { label: string; value: any }[] = [];
}
