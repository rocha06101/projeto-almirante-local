import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-sections',
  imports: [CommonModule, RouterLink],
  templateUrl: './sections.html',
  styleUrl: './sections.scss',
})
export class SectionsComponent {

  @Input() iconSrc: string = '';
  @Input() title: string = '';
  @Input() route: string = '';

}
