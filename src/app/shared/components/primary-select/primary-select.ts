import { Component, Input, forwardRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextPrimarySelectId = 0;

@Component({
  selector: 'app-primary-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './primary-select.html',
  styleUrl: './primary-select.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PrimarySelect),
      multi: true,
    },
  ],
})
export class PrimarySelect implements ControlValueAccessor {
  @Input() label = 'Selecione uma opção';
  @Input() placeholder = '';
  /** Se omitido, gera um id único para associar label e campo. */
  @Input() id = `primary-select-${nextPrimarySelectId++}`;
  @Input() options: { label: string; value: any }[] = [];
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

  handleChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value ?? '');
    this.onChange(this.value());
  }

  handleBlur(): void {
    this.onTouched();
  }
}
