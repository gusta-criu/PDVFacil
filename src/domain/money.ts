/** Dinheiro é sempre representado em centavos inteiros (PRD §6). */

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents)) throw new Error(`Valor monetário inválido: ${cents}`);
}

/** 649 -> "6,49"; 20140 -> "201,40"; 123456 -> "1.234,56" */
export function formatCents(cents: number): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, '0');
  const reaisStr = String(reais).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${reaisStr},${centavos}`;
}

export function formatBRL(cents: number): string {
  const s = formatCents(cents);
  return s.startsWith('-') ? `-R$ ${s.slice(1)}` : `R$ ${s}`;
}

/**
 * Converte texto digitado ("6,49", "6.49", "1.234,56", "R$ 10", "10,5") em centavos
 * sem passar por ponto flutuante. Retorna null se inválido.
 */
export function parseMoneyToCents(input: string): number | null {
  let s = input.replace(/R\$/i, '').replace(/\s/g, '');
  if (s === '') return null;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const reais = Number.parseInt(m[1], 10);
  const cents = m[2] ? Number.parseInt(m[2].padEnd(2, '0'), 10) : 0;
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Converte gramas digitadas ("1508", "1,508 kg" não é suportado aqui). */
export function formatWeightKg(grams: number): string {
  const kg = Math.floor(grams / 1000);
  const g = String(grams % 1000).padStart(3, '0');
  return `${kg},${g} kg`;
}
