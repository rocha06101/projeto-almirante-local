import { A11yModule } from '@angular/cdk/a11y';
import { Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, viewChild } from '@angular/core';

let proximoId = 0;

@Component({
  selector: 'app-modal',
  imports: [A11yModule],
  templateUrl: './modal.html',
  styleUrl: './modal.scss',
})
export class Modal {
  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');
  private readonly destroyRef = inject(DestroyRef);

  readonly titulo = input.required<string>();
  readonly fechar = output<void>();
  readonly tituloId = `app-modal-titulo-${++proximoId}`;

  constructor() {
    afterNextRender(() => {
      const dialogo = this.dialogo().nativeElement;
      const focoAnterior = dialogo.ownerDocument.activeElement;
      dialogo.showModal();

      this.destroyRef.onDestroy(() => {
        dialogo.close();
        if (focoAnterior instanceof HTMLElement && focoAnterior.isConnected) {
          focoAnterior.focus({ preventScroll: true });
        }
      });
    });
  }

  clicarFundo(evento: MouseEvent): void {
    if (evento.target === evento.currentTarget) this.fechar.emit();
  }

  cancelar(evento: Event): void {
    evento.preventDefault();
    this.fechar.emit();
  }
}
