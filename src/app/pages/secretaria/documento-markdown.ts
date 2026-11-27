import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
} from '@angular/core';
import { renderizarMarkdown } from './renderizar-markdown';

@Component({
  selector: '[appDocumentoMarkdown]',
  standalone: true,
  template: '<div [innerHTML]="html()"></div>',
})
export class DocumentoMarkdown {
  readonly markdown = input.required<string>();
  readonly html = computed(() => renderizarMarkdown(this.markdown()));

  private readonly elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterRenderEffect({
      write: () => {
        // Reaplica os atributos quando a digitação atualiza os links.
        this.html();

        for (const link of this.elemento.nativeElement.querySelectorAll<HTMLAnchorElement>('a[href]')) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      },
    });
  }
}