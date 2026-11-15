import type { PaymentMethod, Sale } from './types';

export type DailyClosing = {
  businessDate: string;
  salesCount: number;
  totalCents: number;
  discountCents: number;
  byPayment: Record<PaymentMethod, { count: number; totalCents: number }>;
  cancelledCount: number;
  cancelledTotalCents: number;
};

/** RF-12: considera apenas vendas concluídas; canceladas aparecem à parte. */
export function summarizeDay(businessDate: string, sales: Sale[]): DailyClosing {
  const result: DailyClosing = {
    businessDate,
    salesCount: 0,
    totalCents: 0,
    discountCents: 0,
    byPayment: {
      pix: { count: 0, totalCents: 0 },
      cash: { count: 0, totalCents: 0 },
      card: { count: 0, totalCents: 0 },
    },
    cancelledCount: 0,
    cancelledTotalCents: 0,
  };
  for (const s of sales) {
    if (s.businessDate !== businessDate) continue;
    if (s.status === 'cancelled') {
      result.cancelledCount++;
      result.cancelledTotalCents += s.totalCents;
      continue;
    }
    result.salesCount++;
    result.totalCents += s.totalCents;
    result.discountCents += s.discountCents;
    result.byPayment[s.paymentMethod].count++;
    result.byPayment[s.paymentMethod].totalCents += s.totalCents;
  }
  return result;
}

/** Data de movimento no fuso local do aparelho: "AAAA-MM-DD". */
export function toBusinessDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
