import { applyMask, caretAfterDigits } from './masks';

describe('masks', () => {
  it('CPF: formata parcial e completo, ignora letras e corta excesso', () => {
    expect(applyMask('123', 'cpf')).toBe('123');
    expect(applyMask('1234', 'cpf')).toBe('123.4');
    expect(applyMask('1234567', 'cpf')).toBe('123.456.7');
    expect(applyMask('12345678900', 'cpf')).toBe('123.456.789-00');
    expect(applyMask('123.456.789-00999', 'cpf')).toBe('123.456.789-00');
    expect(applyMask('12a3', 'cpf')).toBe('123');
  });

  it('data: dd/mm/aaaa', () => {
    expect(applyMask('0', 'data')).toBe('0');
    expect(applyMask('011', 'data')).toBe('01/1');
    expect(applyMask('01102010', 'data')).toBe('01/10/2010');
    expect(applyMask('0110201099', 'data')).toBe('01/10/2010');
  });

  it('telefone: fixo (8 dígitos) e celular (9 dígitos) com DDD', () => {
    expect(applyMask('', 'telefone')).toBe('');
    expect(applyMask('1', 'telefone')).toBe('(1');
    expect(applyMask('119', 'telefone')).toBe('(11) 9');
    expect(applyMask('1133334444', 'telefone')).toBe('(11) 3333-4444');
    expect(applyMask('11987654321', 'telefone')).toBe('(11) 98765-4321');
    expect(applyMask('(11) 98765-43219', 'telefone')).toBe('(11) 98765-4321');
  });

  it('posiciona o cursor depois do mesmo dígito no texto formatado', () => {
    expect(caretAfterDigits('123.456.789-00', 0)).toBe(0);
    expect(caretAfterDigits('123.456.789-00', 3)).toBe(3);
    expect(caretAfterDigits('123.456.789-00', 4)).toBe(5);
    expect(caretAfterDigits('123.456.789-00', 11)).toBe(14);
  });
});
