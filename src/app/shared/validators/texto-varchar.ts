/** Caracteres imprimíveis aceitos pelas colunas varchar do backend (Windows-1252). */
export function cabeEmWindows1252(texto: string): boolean {
  return /^[\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]+$/u.test(texto);
}
