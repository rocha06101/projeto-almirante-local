import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PasswordToggleComponent } from './password-toggle';

describe('PasswordToggleComponent', () => {
  let component: PasswordToggleComponent;
  let fixture: ComponentFixture<PasswordToggleComponent>;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PasswordToggleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PasswordToggleComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    button = fixture.nativeElement.querySelector('button');
  });

  it('começa com a senha oculta e oferece "Exibir senha"', () => {
    expect(component.visible()).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Exibir senha');
  });

  it('é um botão type="button" para não submeter formulários', () => {
    expect(button.type).toBe('button');
  });

  it('alterna entre exibir e ocultar a cada clique', async () => {
    button.click();
    await fixture.whenStable();
    expect(component.visible()).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('Ocultar senha');

    button.click();
    await fixture.whenStable();
    expect(component.visible()).toBe(false);
    expect(button.getAttribute('aria-label')).toBe('Exibir senha');
  });

  it('troca o ícone conforme o estado', async () => {
    const icon = () => fixture.nativeElement.querySelector('svg').innerHTML;
    const hiddenIcon = icon();

    button.click();
    await fixture.whenStable();

    expect(icon()).not.toBe(hiddenIcon);
    expect(fixture.nativeElement.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
  });
});
