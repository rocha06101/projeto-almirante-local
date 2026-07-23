import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

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
  @Input() id = 'input-field';
  @Input() type: string = 'text';
}
