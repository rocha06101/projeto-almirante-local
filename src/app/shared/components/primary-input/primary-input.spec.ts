import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrimaryInput } from './primary-input';

describe('PrimaryInput', () => {
  let component: PrimaryInput;
  let fixture: ComponentFixture<PrimaryInput>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryInput]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrimaryInput);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('funciona como controle de formulário (valor, digitação e desabilitado)', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    component.writeValue('inicial');
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.value).toBe('inicial');

    input.value = 'digitado';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('digitado');

    component.setDisabledState(true);
    fixture.detectChanges();
    expect(input.disabled).toBe(true);
  });

  it('aplica a máscara durante a digitação e emite o texto formatado', () => {
    const onChange = vi.fn();
    fixture.componentRef.setInput('mask', 'cpf');
    component.registerOnChange(onChange);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    expect(input.getAttribute('inputmode')).toBe('numeric');

    input.value = '12345678900';
    input.dispatchEvent(new Event('input'));

    expect(input.value).toBe('123.456.789-00');
    expect(onChange).toHaveBeenLastCalledWith('123.456.789-00');

    // Texto colado com caracteres extras não perde dígitos.
    input.value = '987.654abc321-00xx';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('987.654.321-00');

    // Campo completo recusa dígito extra (não empurra nem descarta o último).
    input.value = '5987.654.321-00';
    input.dispatchEvent(new Event('input'));
    expect(input.value).toBe('987.654.321-00');
    expect(onChange).toHaveBeenLastCalledWith('987.654.321-00');

    component.writeValue('98765432100');
    fixture.detectChanges();
    expect(input.value).toBe('987.654.321-00');
  });

  it('sem máscara mantém o valor digitado como está', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Ana 123';
    input.dispatchEvent(new Event('input'));
    expect(onChange).toHaveBeenCalledWith('Ana 123');
    expect(input.hasAttribute('inputmode')).toBe(false);
  });
});
