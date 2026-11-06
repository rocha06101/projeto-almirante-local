import { Component, Input, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextPrimaryTextareaId = 0;

@Component({
  selector: 'app-primary-textarea',
  standalone: true,
  templateUrl: './primary-textarea.html',
  styleUrl: './primary-textarea.scss',
  host: {
    '[class.compact]': 'compact',
    '[class.inactive]': 'inactive',
  },
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PrimaryTextarea),
      multi: true,
    },
  ],
})
export class PrimaryTextarea implements ControlValueAccessor {
  @Input() label = '';
  @Input() placeholder = '';
  @Input() id = `primary-textarea-${nextPrimaryTextareaId++}`;
  @Input() rows = 4;
  @Input() maxlength: number | null = null;
  @Input() invalid = false;
  @Input() describedBy = '';
  @Input() compact = false;
  @Input() inactive = false;
  @Input() minHeight = '';

  readonly value = signal('');
  readonly disabled = signal(false);

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
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
    if (this.inactive || this.disabled()) {
      return;
    }

    this.value.set((event.target as HTMLTextAreaElement).value);
    this.onChange(this.value());
  }

  handleBlur(): void {
    this.onTouched();
  }
}
