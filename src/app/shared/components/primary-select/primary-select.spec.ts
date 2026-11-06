import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PrimarySelect } from './primary-select';

describe('PrimarySelect', () => {
  let component: PrimarySelect;
  let fixture: ComponentFixture<PrimarySelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrimarySelect]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PrimarySelect);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('estado inativo desabilita o select e ignora eventos de seleção', () => {
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    fixture.componentRef.setInput('inactive', true);
    fixture.detectChanges();

    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    expect(select.disabled).toBe(true);
    expect(fixture.nativeElement.classList.contains('inactive')).toBe(true);

    select.value = 'A+';
    select.dispatchEvent(new Event('change'));
    expect(onChange).not.toHaveBeenCalled();
    expect(component.value()).toBe('');
  });
});