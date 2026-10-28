import { FormControl } from '@angular/forms';

import { cpfValidator } from './cpf.validator';

describe('cpfValidator', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(cpfValidator(new FormControl('529.982.247-25'))).toBeNull();
    expect(cpfValidator(new FormControl('52998224725'))).toBeNull();
  });

  it('rejeita dígitos verificadores inválidos, repetidos ou incompletos', () => {
    expect(cpfValidator(new FormControl('529.982.247-24'))).toEqual({ cpfInvalid: true });
    expect(cpfValidator(new FormControl('111.111.111-11'))).toEqual({ cpfInvalid: true });
    expect(cpfValidator(new FormControl('529.982.247'))).toEqual({ cpfInvalid: true });
    expect(cpfValidator(new FormControl('x529.982.247-25'))).toEqual({ cpfInvalid: true });
  });

  it('deixa o campo vazio para ser tratado por Validators.required', () => {
    expect(cpfValidator(new FormControl(''))).toBeNull();
  });
});
