import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import { ToggleSwitch } from './toggle-switch';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, ToggleSwitch],
  template: '<app-toggle-switch label="Ativar CIN" [formControl]="control"></app-toggle-switch>',
})
class ToggleSwitchHost {
  readonly control = new FormControl(false, { nonNullable: true });
}

describe('ToggleSwitch', () => {
  let fixture: ComponentFixture<ToggleSwitchHost>;
  let component: ToggleSwitchHost;

  const input = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[role="switch"]')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToggleSwitchHost],
    }).compileComponents();

    fixture = TestBed.createComponent(ToggleSwitchHost);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('alternates with a click and writes the value to the form control', () => {
    input().click();
    fixture.detectChanges();

    expect(component.control.value).toBe(true);
    expect(input().getAttribute('aria-checked')).toBe('true');

    input().click();
    fixture.detectChanges();

    expect(component.control.value).toBe(false);
    expect(input().getAttribute('aria-checked')).toBe('false');
  });

  it('alternates with Space and prevents the native action from toggling twice', () => {
    const event = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    input().dispatchEvent(event);
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(component.control.value).toBe(true);
    expect(input().getAttribute('aria-checked')).toBe('true');
  });

  it('respects disabled state for pointer and keyboard input', () => {
    component.control.disable();
    fixture.detectChanges();

    expect(input().disabled).toBe(true);
    input().click();
    input().dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    }));
    fixture.detectChanges();

    expect(component.control.value).toBe(false);
    expect(input().getAttribute('aria-checked')).toBe('false');
  });
});
