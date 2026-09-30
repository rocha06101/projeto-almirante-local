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
});
