import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ThemePreference } from '../../../core/services/theme';

@Component({
  selector: 'app-theme-option',
  imports: [NgTemplateOutlet],
  templateUrl: './theme-option.html',
  styleUrl: './theme-option.scss',
  host: {
    '[attr.data-theme-preview]': 'theme()',
    '[class.preview-only]': 'previewOnly()',
  },
})
export class ThemeOption {
  readonly theme = input<ThemePreference>('system');
  readonly label = input('');
  readonly selected = input(false);
  readonly group = input('theme');
  readonly previewOnly = input(false);
  readonly selectionChange = output<ThemePreference>();
}
