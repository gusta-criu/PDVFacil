import { formatCents, formatWeightKg } from './money';
import { PAYMENT_LABELS, type SaleWithItems, type StoreInfo } from './types';

export type ReceiptOptions = {
  /** Caracteres por linha. 32 é o comum para bobina 58 mm com fonte A. */
  columns: number;
  /** Se false, remove acentos (impressora sem página de código compatível). */
  accents: boolean;
  /** Segunda via (reimpressão). */
  reprint: boolean;
};

export const DEFAULT_RECEIPT_OPTIONS: ReceiptOptions = { columns: 32, accents: false, reprint: false };

export type ReceiptLine = { text: string; bold?: boolean };

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function center(text: string, columns: number): string {
  const t = text.slice(0, columns);
  const left = Math.floor((columns - t.length) / 2);
  return ' '.repeat(left) + t;
}

function leftRight(left: string, right: string, columns: number): string {
  const space = columns - right.length - 1;
  const l = left.length > space ? left.slice(0, space) : left;
  return l + ' '.repeat(columns - l.length - right.length) + right;
}

function wrap(text: string, columns: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (current === '') current = w.slice(0, columns);
    else if (current.length + 1 + w.length <= columns) current += ' ' + w;
    else {
      lines.push(current);
      current = w.slice(0, columns);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function formatSaleNumber(n: number): string {
  return String(n).padStart(6, '0');
}

export function buildReceipt(
  sale: SaleWithItems,
  store: StoreInfo,
  opts: ReceiptOptions = DEFAULT_RECEIPT_OPTIONS,
): ReceiptLine[] {
  const cols = opts.columns;
  const sep: ReceiptLine = { text: '-'.repeat(cols) };
  const values = [
    ...sale.items.map((i) => i.priceCents),
    sale.subtotalCents,
    sale.totalCents,
    sale.paymentAmountCents,
  ];
  const valueWidth = Math.max(6, ...values.map((v) => formatCents(v).length));
  const money = (cents: number) => 'R$' + formatCents(cents).padStart(valueWidth);

  const lines: ReceiptLine[] = [];
  lines.push({ text: center(store.name.toUpperCase(), cols), bold: true });
  for (const h of store.headerLines) for (const w of wrap(h, cols)) lines.push({ text: center(w, cols) });
  lines.push({ text: center('RESUMO DE COMPRA', cols) });
  lines.push({ text: center('DOCUMENTO NAO FISCAL', cols), bold: true });
  if (opts.reprint) lines.push({ text: center('*** 2a VIA ***', cols), bold: true });
  lines.push(sep);
  lines.push({ text: `Venda: ${formatSaleNumber(sale.sequentialNumber)}` });
  lines.push({ text: `Data: ${formatDateTime(sale.createdAt)}` });
  if (sale.status === 'cancelled') lines.push({ text: center('VENDA CANCELADA', cols), bold: true });
  lines.push(sep);

  let hasManual = false;
  for (const item of sale.items) {
    const marker = item.source === 'manual' ? '*' : '';
    if (marker) hasManual = true;
    lines.push({ text: leftRight(item.productNameSnapshot.toUpperCase() + marker, money(item.priceCents), cols) });
    if (item.weightGrams !== null && item.unitPriceCentsPerKg !== null) {
      lines.push({
        text: `  ${formatWeightKg(item.weightGrams)} x R$ ${formatCents(item.unitPriceCentsPerKg)}/kg`.slice(0, cols),
      });
    }
  }
  lines.push(sep);
  if (sale.discountCents > 0) {
    lines.push({ text: leftRight('SUBTOTAL', money(sale.subtotalCents), cols) });
    lines.push({ text: leftRight('DESCONTO', '-' + money(sale.discountCents), cols) });
  }
  lines.push({ text: leftRight('TOTAL', money(sale.totalCents), cols), bold: true });
  lines.push({ text: `Pagamento: ${PAYMENT_LABELS[sale.paymentMethod]}` });
  if (sale.paymentMethod === 'cash') {
    lines.push({ text: leftRight('Recebido', money(sale.paymentAmountCents), cols) });
    lines.push({ text: leftRight('Troco', money(sale.changeCents), cols) });
  }
  if (hasManual) lines.push({ text: '* item lancado manualmente' });
  lines.push(sep);
  for (const f of store.footerLines) for (const w of wrap(f, cols)) lines.push({ text: w });
  for (const w of wrap('Este resumo nao substitui um documento fiscal.', Math.min(cols, 25))) {
    lines.push({ text: w });
  }

  // Garantia final: nenhuma linha ultrapassa a largura da bobina.
  const fitted = lines.flatMap((l) =>
    l.text.length <= cols ? [l] : wrap(l.text, cols).map((text) => ({ ...l, text })),
  );
  return opts.accents ? fitted : fitted.map((l) => ({ ...l, text: stripAccents(l.text) }));
}

export function receiptToText(lines: ReceiptLine[]): string {
  return lines.map((l) => l.text).join('\n');
}
