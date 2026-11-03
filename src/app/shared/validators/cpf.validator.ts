import { AbstractControl, ValidationErrors } from '@angular/forms';

function digitoVerificador(digitos: number[], pesoInicial: number): number {
  const soma = digitos.reduce((total, digito, index) => total + digito * (pesoInicial - index), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '').trim();
  if (!value) {
    return null;
  }

  if (!/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(value)) {
    return { cpfInvalid: true };
  }

  const cpf = value.replace(/\D/g, '');
  if (/^(\d)\1{10}$/.test(cpf)) {
    return { cpfInvalid: true };
  }

  const digitos = Array.from(cpf, Number);
  const primeiro = digitoVerificador(digitos.slice(0, 9), 10);
  const segundo = digitoVerificador(digitos.slice(0, 10), 11);

  return digitos[9] === primeiro && digitos[10] === segundo ? null : { cpfInvalid: true };
}
