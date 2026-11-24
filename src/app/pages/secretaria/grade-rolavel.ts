import { CdkScrollable } from '@angular/cdk/scrolling';
import { Directive, DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

const LINHAS_VISIVEIS = 5;

@Directive({
  selector: '[appGradeRolavel]',
  hostDirectives: [CdkScrollable],
})
export class GradeRolavel {
  constructor() {
    const container = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      const table = container.querySelector('table');
      const header = table?.tHead;
      const body = table?.tBodies[0];
      if (!table || !header || !body) return;

      const ajustarAltura = () => {
        const ultimaVisivel = body.rows[LINHAS_VISIVEIS - 1];
        const alturaCabecalho = header.getBoundingClientRect().height;
        container.style.scrollPaddingBlockStart = `${alturaCabecalho}px`;

        if (!ultimaVisivel || body.rows.length <= LINHAS_VISIVEIS) {
          container.style.maxHeight = '';
          return;
        }

        const altura = ultimaVisivel.getBoundingClientRect().bottom - table.getBoundingClientRect().top;
        const barraHorizontal = container.offsetHeight - container.clientHeight;
        container.style.maxHeight = `${altura + barraHorizontal}px`;
      };

      const tamanhos = new ResizeObserver(ajustarAltura);
      const observarLinhas = () => {
        tamanhos.disconnect();
        tamanhos.observe(header);
        for (const linha of Array.from(body.rows).slice(0, LINHAS_VISIVEIS)) {
          tamanhos.observe(linha);
        }
        ajustarAltura();
      };

      const registros = new MutationObserver(() => {
        container.scrollTop = 0;
        observarLinhas();
      });
      registros.observe(body, { childList: true });
      observarLinhas();

      destroyRef.onDestroy(() => {
        tamanhos.disconnect();
        registros.disconnect();
      });
    });
  }
}
