export type InputMask = 'cpf' | 'telefone' | 'data';

export const MASK_MAX_DIGITS: Record<InputMask, number> = {
  cpf: 11,
  telefone: 11,
  data: 8,
};

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Aplica a máscara ao que já foi digitado (parcial ou completo), ignorando qualquer caractere que não seja dígito. */
export function applyMask(value: string | null | undefined, mask: InputMask): string {
  const digits = onlyDigits(value).slice(0, MASK_MAX_DIGITS[mask]);

  switch (mask) {
    case 'cpf':
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    case 'data':
      return digits.replace(/^(\d{2})(\d)/, '$1/$2').replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
    case 'telefone': {
      if (digits.length <= 2) {
        return digits.length ? `(${digits}` : '';
      }
      const ddd = digits.slice(0, 2);
      const numero = digits.slice(2);
      // Fixo (8 dígitos): 0000-0000; celular (9 dígitos): 00000-0000.
      const corte = numero.length > 8 ? 5 : 4;
      return numero.length > corte
        ? `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`
        : `(${ddd}) ${numero}`;
    }
  }
}

/** Posição no texto formatado logo após o N-ésimo dígito (mantém o cursor no lugar ao editar no meio). */
export function caretAfterDigits(formatted: string, digitCount: number): number {
  if (digitCount <= 0) {
    return 0;
  }

  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === digitCount) {
      return i + 1;
    }
  }
  return formatted.length;
}
