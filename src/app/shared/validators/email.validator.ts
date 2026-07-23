import { AbstractControl, ValidationErrors } from '@angular/forms';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function emailFormatValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();

  if (!value) {
    return null;
  }

  return EMAIL_PATTERN.test(value) ? null : { emailFormat: true };
}
