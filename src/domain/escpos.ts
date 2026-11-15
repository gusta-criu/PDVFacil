import type { ReceiptLine } from './receipt';

/**
 * Codificador ESC/POS mínimo (comandos genéricos: ESC @, ESC E, ESC d).
 * Mantido puro e testável. O transporte (Bluetooth SPP/BLE) e a confirmação de que a
 * impressora escolhida aceita esses comandos ficam pendentes (PRD §15, item 1).
 * Somente ASCII é enviado; caracteres fora dele viram '?'.
 */
const ESC = 0x1b;

export function encodeEscPos(lines: ReceiptLine[], feedLines = 3): Uint8Array {
  const out: number[] = [ESC, 0x40];
  for (const line of lines) {
    if (line.bold) out.push(ESC, 0x45, 1);
    for (const ch of line.text) {
      const code = ch.codePointAt(0)!;
      out.push(code >= 0x20 && code < 0x7f ? code : 0x3f);
    }
    out.push(0x0a);
    if (line.bold) out.push(ESC, 0x45, 0);
  }
  out.push(ESC, 0x64, feedLines);
  return Uint8Array.from(out);
}
