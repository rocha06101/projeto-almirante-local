import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input, forwardRef } from '@angular/core';
  
import {
  ControlValueAccessor,
  NG_VALUE_ACCESSOR
} from '@angular/forms';


@Component({
  selector: 'app-input',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './input.html',
  styleUrl: './input.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => InputComponent),
      multi: true
    }
  ]
})
export class InputComponent implements ControlValueAccessor {

  @Input() type: string = 'text';
  @Input() placeholder: string = '';
  @Input() label: string = '';
  @Input() iconSrc?: string;
  @Input() iconAlt: string = '';

  value: string = '';
  disable: boolean = false;

  private onChange: (value: string) => void = () =>{};
  private onTouched: () => void = () => {};
  @HostBinding('class.has-value') get hasValue() {
    return this.value.length > 0;
  }

writeValue(value: string): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disable = isDisabled;
  }

  handleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value || '';
    this.value = value;

    this.onChange(this.value);
  }

  handleBlur() {
    this.onTouched();
  }

  handlePaste(e: ClipboardEvent) {
    if (this.type === 'email') {
      e.preventDefault();
    }
  }

  onInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value || '';
  }
}
