import { assertCents } from './money';
import type { Cart, CartItem, PaymentMethod } from './types';

export function emptyCart(now: Date = new Date()): Cart {
  return { items: [], discountCents: 0, discountReason: null, startedAt: now.toISOString() };
}

export function subtotalCents(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.priceCents, 0);
}

export function totalCents(cart: Cart): number {
  return subtotalCents(cart) - cart.discountCents;
}

export function addItem(cart: Cart, item: CartItem): Cart {
  assertCents(item.priceCents);
  if (item.priceCents <= 0) throw new Error('Item com valor zero ou negativo não pode ser adicionado');
  return { ...cart, items: [...cart.items, item] };
}

export function removeItem(cart: Cart, lineId: string): Cart {
  const items = cart.items.filter((i) => i.lineId !== lineId);
  // Se o desconto deixaria o total negativo após a remoção, ele é zerado.
  const sub = items.reduce((s, i) => s + i.priceCents, 0);
  if (cart.discountCents > sub) {
    return { ...cart, items, discountCents: 0, discountReason: null };
  }
  return { ...cart, items };
}

export type DiscountError = 'negative' | 'exceeds_subtotal' | 'reason_required';

export function applyDiscount(
  cart: Cart,
  discountCents: number,
  reason: string,
): { ok: true; cart: Cart } | { ok: false; error: DiscountError } {
  assertCents(discountCents);
  if (discountCents < 0) return { ok: false, error: 'negative' };
  if (discountCents === 0) return { ok: true, cart: { ...cart, discountCents: 0, discountReason: null } };
  if (discountCents > subtotalCents(cart)) return { ok: false, error: 'exceeds_subtotal' };
  if (reason.trim() === '') return { ok: false, error: 'reason_required' };
  return { ok: true, cart: { ...cart, discountCents, discountReason: reason.trim() } };
}

export type DuplicateCheck =
  | { kind: 'none' }
  /** Mesmo código lido há poucos segundos: provável leitura acidental. */
  | { kind: 'recent_repeat'; existing: CartItem }
  /** Mesmo código já está no carrinho: pode ser embalagem igual legítima. */
  | { kind: 'same_code_in_cart'; existing: CartItem; count: number };

export const RECENT_REPEAT_WINDOW_MS = 5000;

/**
 * RF-06: não proíbe duplicatas, apenas sinaliza para que a UI peça confirmação.
 */
export function checkDuplicate(
  cart: Cart,
  barcodeRaw: string,
  now: Date = new Date(),
  windowMs: number = RECENT_REPEAT_WINDOW_MS,
): DuplicateCheck {
  const same = cart.items.filter((i) => i.barcodeRaw === barcodeRaw);
  if (same.length === 0) return { kind: 'none' };
  const latest = same.reduce((a, b) => (a.addedAt >= b.addedAt ? a : b));
  const elapsed = now.getTime() - new Date(latest.addedAt).getTime();
  if (elapsed >= 0 && elapsed < windowMs) return { kind: 'recent_repeat', existing: latest };
  return { kind: 'same_code_in_cart', existing: latest, count: same.length };
}

export type ChangeResult =
  | { ok: true; changeCents: number }
  | { ok: false; error: 'insufficient' };

export function computeChange(totalCents: number, receivedCents: number): ChangeResult {
  assertCents(totalCents);
  assertCents(receivedCents);
  if (receivedCents < totalCents) return { ok: false, error: 'insufficient' };
  return { ok: true, changeCents: receivedCents - totalCents };
}

export type PaymentInput = {
  method: PaymentMethod;
  /** Valor recebido; obrigatório apenas no dinheiro. Nos demais, igual ao total. */
  receivedCents?: number;
};

export type CheckoutValidation =
  | { ok: true; paymentAmountCents: number; changeCents: number }
  | { ok: false; message: string };

export function validateCheckout(cart: Cart, payment: PaymentInput): CheckoutValidation {
  if (cart.items.length === 0) return { ok: false, message: 'O carrinho está vazio.' };
  const total = totalCents(cart);
  if (total <= 0) return { ok: false, message: 'O total da venda deve ser maior que zero.' };
  if (payment.method !== 'cash') return { ok: true, paymentAmountCents: total, changeCents: 0 };
  const received = payment.receivedCents ?? total;
  const change = computeChange(total, received);
  if (!change.ok) return { ok: false, message: 'Valor recebido é menor que o total.' };
  return { ok: true, paymentAmountCents: received, changeCents: change.changeCents };
}
