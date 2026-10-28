import { Component, Input, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { InputMask, MASK_MAX_DIGITS, applyMask, caretAfterDigits, onlyDigits } from '../../utils/masks';

let nextPrimaryInputId = 0;

@Component({
  selector: 'app-primary-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './primary-input.html',
  styleUrl: './primary-input.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PrimaryInput),
      multi: true,
    },
  ],
})
export class PrimaryInput implements ControlValueAccessor {
  @Input() label = 'Nome Completo';
  @Input() placeholder = '';
  @Input() id = `primary-input-${nextPrimaryInputId++}`;
  @Input() type: string = 'text';
  @Input() autocomplete = '';
  @Input() invalid = false;
  @Input() describedBy = '';
  @Input() mask: InputMask | '' = '';

  readonly value = signal('');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(this.mask ? applyMask(value, this.mask) : (value ?? ''));
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  handleInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value ?? '';

    if (this.mask) {
      const previous = this.value();
      const maxDigits = MASK_MAX_DIGITS[this.mask];
      if (onlyDigits(previous).length >= maxDigits && onlyDigits(raw).length > maxDigits) {
        const caret = Math.max(0, (input.selectionStart ?? raw.length) - (raw.length - previous.length));
        input.value = previous;
        input.setSelectionRange?.(caret, caret);
        return;
      }

      const digitsBeforeCaret = onlyDigits(raw.slice(0, input.selectionStart ?? raw.length)).length;
      const formatted = applyMask(raw, this.mask);
      input.value = formatted;
      const caret = caretAfterDigits(formatted, digitsBeforeCaret);
      input.setSelectionRange?.(caret, caret);
      this.value.set(formatted);
    } else {
      this.value.set(raw);
    }

    this.onChange(this.value());
  }

  handleBlur(): void {
    this.onTouched();
  }
}
