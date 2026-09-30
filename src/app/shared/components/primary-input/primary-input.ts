import { Component, Input, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

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
  /** Se omitido, gera um id único para associar label e campo (vários campos convivem na mesma página). */
  @Input() id = `primary-input-${nextPrimaryInputId++}`;
  @Input() type: string = 'text';
  @Input() autocomplete = '';
  /** Marca o campo como inválido para tecnologias assistivas. */
  @Input() invalid = false;
  /** id do elemento com a mensagem de erro/ajuda associada ao campo. */
  @Input() describedBy = '';

  // Signals: writeValue/setDisabledState chegam fora do template e precisam atualizar a view (app zoneless).
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
    this.value.set((event.target as HTMLInputElement).value ?? '');
    this.onChange(this.value());
  }

  handleBlur(): void {
    this.onTouched();
  }
}
