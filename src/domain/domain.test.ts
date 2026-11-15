import { describe, expect, it } from 'vitest';
import { computeEan13CheckDigit, isValidEan13 } from './ean13';
import { CANDIDATE_LAYOUT, isLayoutConsistent, normalizeScaleCode, parseScaleBarcode } from './barcode';
import { formatBRL, formatCents, parseMoneyToCents } from './money';
import {
  addItem,
  applyDiscount,
  checkDuplicate,
  computeChange,
  emptyCart,
  removeItem,
  subtotalCents,
  totalCents,
  validateCheckout,
} from './cart';
import { buildReceipt, receiptToText } from './receipt';
import { summarizeDay } from './closing';
import { encodeEscPos } from './escpos';
import type { CartItem, Sale, SaleWithItems } from './types';

/**
 * Etiquetas do PRD §2. ATENÇÃO: apenas a primeira foi informada explicitamente;
 * as outras são transcrições visuais. Substituir/ampliar com leituras digitais reais
 * (protocolo de validação, PRD §8) antes de marcar o layout como validado.
 */
const PRD_LABELS = [
  { raw: '2000003006496', product: '3', priceCents: 649, name: 'Patinho' },
  { raw: '2000018090480', product: '18', priceCents: 9048, name: 'Maminha' },
  { raw: '2000000201405', product: '0', priceCents: 20140, name: 'Diversos' },
];

describe('EAN-13', () => {
  it('calcula o dígito verificador', () => {
    expect(computeEan13CheckDigit('200000300649')).toBe(6);
    expect(computeEan13CheckDigit('789100000000')).toBe(computeEan13CheckDigit('789100000000'));
    expect(computeEan13CheckDigit('400638133393')).toBe(1); // exemplo GS1 4006381333931
  });

  it.each(PRD_LABELS)('aceita etiqueta $name ($raw)', ({ raw }) => {
    expect(isValidEan13(raw)).toBe(true);
  });

  it('rejeita dígito verificador errado e formatos inválidos', () => {
    expect(isValidEan13('2000003006497')).toBe(false);
    expect(isValidEan13('200000300649')).toBe(false);
    expect(isValidEan13('20000030064960')).toBe(false);
    expect(isValidEan13('20000030064a6')).toBe(false);
    expect(isValidEan13('')).toBe(false);
  });

  it('detecta troca de dois dígitos vizinhos comum em transcrição', () => {
    expect(isValidEan13('2000030006496')).toBe(false);
  });
});

describe('parser da etiqueta (layout candidato)', () => {
  it('layout candidato é consistente e está marcado como NÃO validado', () => {
    expect(isLayoutConsistent(CANDIDATE_LAYOUT)).toBe(true);
    expect(CANDIDATE_LAYOUT.validated).toBe(false);
  });

  it.each(PRD_LABELS)('$raw -> produto $product, $priceCents centavos', ({ raw, product, priceCents }) => {
    const r = parseScaleBarcode(raw, CANDIDATE_LAYOUT);
    expect(r).toEqual({
      ok: true,
      value: { raw, productCode: product, priceCents, weightGrams: null },
    });
  });

  it('soma das 3 etiquetas confere com o exemplo do PRD (R$ 298,37)', () => {
    const sum = PRD_LABELS.reduce((s, l) => {
      const r = parseScaleBarcode(l.raw, CANDIDATE_LAYOUT);
      if (!r.ok) throw new Error(r.message);
      return s + r.value.priceCents!;
    }, 0);
    expect(sum).toBe(29837);
  });

  it('rejeita códigos inválidos com motivo', () => {
    expect(parseScaleBarcode('123', CANDIDATE_LAYOUT)).toMatchObject({ ok: false, error: 'not_13_digits' });
    expect(parseScaleBarcode('2000003006497', CANDIDATE_LAYOUT)).toMatchObject({ ok: false, error: 'invalid_check_digit' });
    // EAN comum de produto industrializado (prefixo 789, Brasil)
    expect(parseScaleBarcode('7891000315507', CANDIDATE_LAYOUT)).toMatchObject({ ok: false, error: 'unknown_prefix' });
  });

  it('rejeita valor zerado', () => {
    const first12 = '200000300000';
    const raw = first12 + computeEan13CheckDigit(first12);
    expect(parseScaleBarcode(raw, CANDIDATE_LAYOUT)).toMatchObject({ ok: false, error: 'zero_value' });
  });

  it('aceita espaços em volta do código lido', () => {
    expect(parseScaleBarcode(' 2000003006496\n', CANDIDATE_LAYOUT).ok).toBe(true);
  });

  it('suporta layout de peso (sem inventar preço)', () => {
    const r = parseScaleBarcode('2000018090480', { ...CANDIDATE_LAYOUT, valueKind: 'weight_grams' });
    expect(r).toMatchObject({ ok: true, value: { priceCents: null, weightGrams: 9048 } });
  });

  it('rejeita layouts sobrepostos ou fora dos limites', () => {
    expect(isLayoutConsistent({ ...CANDIDATE_LAYOUT, valueStart: 5 })).toBe(false);
    expect(isLayoutConsistent({ ...CANDIDATE_LAYOUT, valueLength: 6 })).toBe(false);
    expect(isLayoutConsistent({ ...CANDIDATE_LAYOUT, productStart: 0 })).toBe(false);
    expect(parseScaleBarcode('2000003006496', { ...CANDIDATE_LAYOUT, valueLength: 6 })).toMatchObject({
      ok: false,
      error: 'invalid_layout',
    });
  });

  it('normaliza o código do produto', () => {
    expect(normalizeScaleCode('000003')).toBe('3');
    expect(normalizeScaleCode('000000')).toBe('0');
    expect(normalizeScaleCode(' 18 ')).toBe('18');
    expect(() => normalizeScaleCode('1a')).toThrow();
  });
});

describe('dinheiro', () => {
  it('formata centavos', () => {
    expect(formatCents(649)).toBe('6,49');
    expect(formatCents(5)).toBe('0,05');
    expect(formatCents(20140)).toBe('201,40');
    expect(formatCents(123456789)).toBe('1.234.567,89');
    expect(formatBRL(-150)).toBe('-R$ 1,50');
  });

  it('interpreta valores digitados sem float', () => {
    expect(parseMoneyToCents('6,49')).toBe(649);
    expect(parseMoneyToCents('6.49')).toBe(649);
    expect(parseMoneyToCents('R$ 1.234,56')).toBe(123456);
    expect(parseMoneyToCents('1.234')).toBe(123400);
    expect(parseMoneyToCents('10')).toBe(1000);
    expect(parseMoneyToCents('10,5')).toBe(1050);
    expect(parseMoneyToCents('0,1')).toBe(10);
    expect(parseMoneyToCents('abc')).toBeNull();
    expect(parseMoneyToCents('1,234')).toBeNull();
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('-5')).toBeNull();
  });

  it('não sofre erro de ponto flutuante clássico', () => {
    expect(parseMoneyToCents('0,29')).toBe(29); // 0.29*100 = 28.999999999999996 em float
    expect(parseMoneyToCents('1,15')).toBe(115);
  });
});

let seq = 0;
function item(raw: string | null, priceCents: number, addedAt = '2026-11-15T10:00:00.000Z'): CartItem {
  return {
    lineId: `l${++seq}`,
    source: raw ? 'barcode' : 'manual',
    productId: 1,
    productName: 'X',
    barcodeRaw: raw,
    priceCents,
    weightGrams: null,
    unitPriceCentsPerKg: null,
    addedAt,
  };
}

describe('carrinho', () => {
  it('soma em centavos, inclusive etiquetas idênticas', () => {
    let c = emptyCart();
    c = addItem(c, item('2000003006496', 649));
    c = addItem(c, item('2000003006496', 649));
    c = addItem(c, item('2000018090480', 9048));
    expect(c.items).toHaveLength(3);
    expect(subtotalCents(c)).toBe(649 * 2 + 9048);
  });

  it('não aceita item zerado', () => {
    expect(() => addItem(emptyCart(), item(null, 0))).toThrow();
  });

  it('remove item e recalcula; zera desconto que deixaria total negativo', () => {
    let c = emptyCart();
    const a = item(null, 1000);
    const b = item(null, 200);
    c = addItem(addItem(c, a), b);
    const d = applyDiscount(c, 500, 'cliente antigo');
    if (!d.ok) throw new Error();
    c = removeItem(d.cart, a.lineId);
    expect(c.items).toHaveLength(1);
    expect(c.discountCents).toBe(0);
    expect(totalCents(c)).toBe(200);
  });

  it('desconto exige motivo e não permite total negativo', () => {
    const c = addItem(emptyCart(), item(null, 1000));
    expect(applyDiscount(c, 1001, 'x')).toEqual({ ok: false, error: 'exceeds_subtotal' });
    expect(applyDiscount(c, 100, '  ')).toEqual({ ok: false, error: 'reason_required' });
    expect(applyDiscount(c, -1, 'x')).toEqual({ ok: false, error: 'negative' });
    const ok = applyDiscount(c, 1000, 'cortesia');
    expect(ok.ok && totalCents(ok.cart)).toBe(0);
  });

  it('sinaliza leitura repetida recente e código igual já no carrinho', () => {
    const c = addItem(emptyCart(), item('2000003006496', 649, '2026-11-15T10:00:00.000Z'));
    expect(checkDuplicate(c, '2000018090480', new Date('2026-11-15T10:00:01Z')).kind).toBe('none');
    expect(checkDuplicate(c, '2000003006496', new Date('2026-11-15T10:00:02Z')).kind).toBe('recent_repeat');
    const later = checkDuplicate(c, '2000003006496', new Date('2026-11-15T10:01:00Z'));
    expect(later).toMatchObject({ kind: 'same_code_in_cart', count: 1 });
  });

  it('troco', () => {
    expect(computeChange(29837, 30000)).toEqual({ ok: true, changeCents: 163 });
    expect(computeChange(29837, 29837)).toEqual({ ok: true, changeCents: 0 });
    expect(computeChange(29837, 29000)).toEqual({ ok: false, error: 'insufficient' });
  });

  it('valida checkout', () => {
    expect(validateCheckout(emptyCart(), { method: 'pix' }).ok).toBe(false);
    const c = addItem(emptyCart(), item(null, 649));
    expect(validateCheckout(c, { method: 'pix' })).toEqual({ ok: true, paymentAmountCents: 649, changeCents: 0 });
    expect(validateCheckout(c, { method: 'cash', receivedCents: 1000 })).toEqual({
      ok: true,
      paymentAmountCents: 1000,
      changeCents: 351,
    });
    expect(validateCheckout(c, { method: 'cash', receivedCents: 500 }).ok).toBe(false);
    const free = applyDiscount(c, 649, 'cortesia');
    expect(free.ok && validateCheckout(free.cart, { method: 'pix' }).ok).toBe(false);
  });
});

function sale(over: Partial<SaleWithItems> = {}): SaleWithItems {
  return {
    id: 'u1',
    sequentialNumber: 1,
    createdAt: new Date(2026, 10, 15, 10, 35).toISOString(),
    businessDate: '2026-11-15',
    status: 'completed',
    subtotalCents: 29837,
    discountCents: 0,
    discountReason: null,
    totalCents: 29837,
    paymentMethod: 'pix',
    paymentAmountCents: 29837,
    changeCents: 0,
    printedAt: null,
    printCount: 0,
    cancelledAt: null,
    cancelReason: null,
    items: PRD_LABELS.map((l, i) => ({
      id: i + 1,
      saleId: 'u1',
      position: i,
      productId: i + 1,
      productNameSnapshot: l.name,
      barcodeRaw: l.raw,
      source: 'barcode' as const,
      priceCents: l.priceCents,
      weightGrams: null,
      unitPriceCentsPerKg: null,
    })),
    ...over,
  };
}

describe('resumo impresso', () => {
  const store = { name: 'Casa do Bife', headerLines: [], footerLines: ['Obrigado pela preferência!'] };

  it('reproduz o layout do PRD §10 em 32 colunas', () => {
    const text = receiptToText(buildReceipt(sale(), store));
    expect(text).toBe(
      [
        '          CASA DO BIFE',
        '        RESUMO DE COMPRA',
        '      DOCUMENTO NAO FISCAL',
        '--------------------------------',
        'Venda: 000001',
        'Data: 15/11/2026 10:35',
        '--------------------------------',
        'PATINHO                 R$  6,49',
        'MAMINHA                 R$ 90,48',
        'DIVERSOS                R$201,40',
        '--------------------------------',
        'TOTAL                   R$298,37',
        'Pagamento: PIX',
        '--------------------------------',
        'Obrigado pela preferencia!',
        'Este resumo nao substitui',
        'um documento fiscal.',
      ].join('\n'),
    );
  });

  it('nenhuma linha excede a largura configurada', () => {
    const long = sale({
      items: [{ ...sale().items[0], productNameSnapshot: 'Contrafilé maturado especial do chef', priceCents: 1234567 }],
      totalCents: 1234567,
      subtotalCents: 1234567,
      paymentAmountCents: 1234567,
    });
    for (const cols of [24, 32, 42, 48]) {
      for (const l of buildReceipt(long, store, { columns: cols, accents: false, reprint: true })) {
        expect(l.text.length).toBeLessThanOrEqual(cols);
      }
    }
  });

  it('identifica 2a via, item manual, desconto e troco', () => {
    const s = sale({
      paymentMethod: 'cash',
      discountCents: 37,
      discountReason: 'arredondamento',
      totalCents: 29800,
      paymentAmountCents: 30000,
      changeCents: 200,
    });
    s.items[2] = { ...s.items[2], source: 'manual', barcodeRaw: null };
    const text = receiptToText(buildReceipt(s, store, { columns: 32, accents: false, reprint: true }));
    expect(text).toContain('2a VIA');
    expect(text).toContain('DIVERSOS*');
    expect(text).toContain('* item lancado manualmente');
    expect(text).toMatch(/DESCONTO\s+-R\$\s+0,37/);
    expect(text).toMatch(/Troco\s+R\$\s+2,00/);
    expect(text).toContain('Pagamento: DINHEIRO');
  });

  it('mantém acentos quando habilitado e remove quando não', () => {
    const s = sale();
    s.items[0] = { ...s.items[0], productNameSnapshot: 'Acém' };
    expect(receiptToText(buildReceipt(s, store, { columns: 32, accents: true, reprint: false }))).toContain('ACÉM');
    expect(receiptToText(buildReceipt(s, store, { columns: 32, accents: false, reprint: false }))).toContain('ACEM');
  });
});

describe('ESC/POS', () => {
  it('gera bytes ASCII com init, negrito e avanço', () => {
    const bytes = encodeEscPos([{ text: 'AB', bold: true }, { text: 'é' }], 2);
    expect(Array.from(bytes)).toEqual([0x1b, 0x40, 0x1b, 0x45, 1, 65, 66, 10, 0x1b, 0x45, 0, 0x3f, 10, 0x1b, 0x64, 2]);
  });
});

describe('fechamento diário', () => {
  it('agrupa por forma de pagamento e separa canceladas', () => {
    const base = sale();
    const sales: Sale[] = [
      { ...base, id: 'a', totalCents: 1000, paymentMethod: 'pix' },
      { ...base, id: 'b', totalCents: 2000, paymentMethod: 'cash', discountCents: 100 },
      { ...base, id: 'c', totalCents: 3000, paymentMethod: 'card' },
      { ...base, id: 'd', totalCents: 500, paymentMethod: 'pix' },
      { ...base, id: 'e', totalCents: 9999, status: 'cancelled' },
      { ...base, id: 'f', totalCents: 7777, businessDate: '2026-11-14' },
    ];
    const r = summarizeDay('2026-11-15', sales);
    expect(r.salesCount).toBe(4);
    expect(r.totalCents).toBe(6500);
    expect(r.discountCents).toBe(100);
    expect(r.byPayment.pix).toEqual({ count: 2, totalCents: 1500 });
    expect(r.byPayment.cash).toEqual({ count: 1, totalCents: 2000 });
    expect(r.byPayment.card).toEqual({ count: 1, totalCents: 3000 });
    expect(r.cancelledCount).toBe(1);
    expect(r.cancelledTotalCents).toBe(9999);
  });
});
