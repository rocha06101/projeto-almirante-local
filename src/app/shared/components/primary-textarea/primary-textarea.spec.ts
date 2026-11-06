import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PrimaryTextarea } from './primary-textarea';

describe('PrimaryTextarea', () => {
  let component: PrimaryTextarea;
  let fixture: ComponentFixture<PrimaryTextarea>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimaryTextarea],
    }).compileComponents();

    fixture = TestBed.createComponent(PrimaryTextarea);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('renders the label, placeholder and configured textarea properties', () => {
    fixture.componentRef.setInput('label', 'Alergias/ Doenças');
    fixture.componentRef.setInput('placeholder', 'Descreva alergias e doenças');
    fixture.componentRef.setInput('maxlength', 2000);
    fixture.detectChanges();

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(fixture.nativeElement.querySelector('label').textContent).toContain('Alergias/ Doenças');
    expect(textarea.placeholder).toBe('Descreva alergias e doenças');
    expect(textarea.maxLength).toBe(2000);
  });

  it('funciona como controle de formulário', () => {
    const onChange = vi.fn();
    const onTouched = vi.fn();
    component.registerOnChange(onChange);
    component.registerOnTouched(onTouched);
    component.writeValue('Asma');
    fixture.detectChanges();

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea.value).toBe('Asma');

    textarea.value = 'Alergia';
    textarea.dispatchEvent(new Event('input'));
    textarea.dispatchEvent(new Event('blur'));

    expect(onChange).toHaveBeenCalledWith('Alergia');
    expect(onTouched).toHaveBeenCalled();
  });

  it('estado inativo desabilita o textarea e ignora eventos de digitação', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    fixture.componentRef.setInput('inactive', true);
    fixture.detectChanges();

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea.disabled).toBe(true);
    expect(textarea.getAttribute('aria-disabled')).toBe('true');
    expect(fixture.nativeElement.classList.contains('inactive')).toBe(true);

    textarea.value = 'Não permitido';
    textarea.dispatchEvent(new Event('input'));
    expect(onChange).not.toHaveBeenCalled();
    expect(component.value()).toBe('');
  });
});
