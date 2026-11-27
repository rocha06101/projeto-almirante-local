import { onTestFinished } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <app-modal titulo="Preferências" [dispensavel]="dispensavel" (fechar)="fechamentos = fechamentos + 1">
      <label>Nome <input></label>
      <button modal-acoes type="button">Salvar</button>
    </app-modal>
  `,
})
class ModalHost {
  dispensavel = true;
  fechamentos = 0;
}

describe('Modal', () => {
  beforeEach(() => {
    // O JSDOM não implementa os métodos do diálogo nativo.
    const prototipo = HTMLDialogElement.prototype;
    for (const metodo of ['showModal', 'close'] as const) {
      if (!prototipo[metodo]) {
        Object.defineProperty(prototipo, metodo, { configurable: true, value: () => {} });
        onTestFinished(() => { Reflect.deleteProperty(prototipo, metodo); });
      }
    }
  });

  it('projeta corpo e ações e associa o título ao diálogo', () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    const dialogo: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dialogo.getAttribute('aria-labelledby')).toBe(dialogo.querySelector('h2')?.id);
    expect(dialogo.querySelector('h2')?.textContent).toBe('Preferências');
    expect(dialogo.querySelector('.conteudo input')).not.toBeNull();
    expect(dialogo.querySelector('footer button')?.textContent).toBe('Salvar');
  });

  it('emite uma vez ao clicar no fundo e ignora cliques no painel e em seu conteúdo', () => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.detectChanges();
    const dialogo: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');

    for (const seletor of ['.painel', 'label', 'input', 'button']) {
      dialogo.querySelector<HTMLElement>(seletor)?.click();
    }
    expect(fixture.componentInstance.fechamentos).toBe(0);
    dialogo.click();
    expect(fixture.componentInstance.fechamentos).toBe(1);
  });

  it.each([true, false])('trata Escape e clique no fundo com dispensavel=%s', (dispensavel) => {
    const fixture = TestBed.createComponent(ModalHost);
    fixture.componentInstance.dispensavel = dispensavel;
    fixture.detectChanges();
    const dialogo: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const escape = new Event('cancel', { cancelable: true });

    dialogo.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.fechamentos).toBe(dispensavel ? 1 : 0);
    dialogo.click();
    expect(fixture.componentInstance.fechamentos).toBe(dispensavel ? 2 : 0);
  });
});
