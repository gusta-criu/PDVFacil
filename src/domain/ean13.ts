/**
 * Validação padrão de EAN-13 (GS1).
 * Pesos alternados 1 e 3 sobre os 12 primeiros dígitos, da esquerda para a direita.
 */

export function isThirteenDigits(code: string): boolean {
  return /^\d{13}$/.test(code);
}

/** Calcula o dígito verificador para os 12 primeiros dígitos. */
export function computeEan13CheckDigit(first12: string): number {
  if (!/^\d{12}$/.test(first12)) {
    throw new Error('Esperados exatamente 12 dígitos numéricos');
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = first12.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  if (!isThirteenDigits(code)) return false;
  return computeEan13CheckDigit(code.slice(0, 12)) === Number(code[12]);
}
