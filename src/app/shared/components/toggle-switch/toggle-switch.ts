import { Component, Input, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextToggleSwitchId = 0;

@Component({
  selector: 'app-toggle-switch',
  standalone: true,
  templateUrl: './toggle-switch.html',
  styleUrl: './toggle-switch.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ToggleSwitch),
      multi: true,
    },
  ],
})
export class ToggleSwitch implements ControlValueAccessor {
  @Input() label = '';
  @Input() id = `toggle-switch-${nextToggleSwitchId++}`;

  readonly checked = signal(false);
  readonly disabled = signal(false);

  private onChange: (value: boolean) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: unknown): void {
    this.checked.set(value === true);
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.checked.set(input.checked);
    this.onChange(input.checked);
  }

  handleKeydown(event: KeyboardEvent): void {
    if ((event.key !== ' ' && event.code !== 'Space') || event.repeat) {
      return;
    }

    event.preventDefault();
    if (this.disabled()) {
      return;
    }

    const checked = !this.checked();
    this.checked.set(checked);
    this.onChange(checked);
  }

  handleBlur(): void {
    this.onTouched();
  }
}
