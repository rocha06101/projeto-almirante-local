import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

let nextPrimaryInputId = 0;

@Component({
  selector: 'app-primary-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './primary-input.html',
  styleUrl: './primary-input.scss',
})
export class PrimaryInput {
  @Input() label = 'Nome Completo';
  @Input() placeholder = '';
  /** Se omitido, gera um id único para associar label e campo (vários campos convivem na mesma página). */
  @Input() id = `primary-input-${nextPrimaryInputId++}`;
  @Input() type: string = 'text';
}
