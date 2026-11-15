import { isThirteenDigits, isValidEan13 } from './ean13';

/**
 * Layout das etiquetas de peso variável emitidas pela balança.
 * Posições são índices base 0 sobre a string de 13 dígitos.
 */
export type BarcodeLayout = {
  prefix: string;
  productStart: number;
  productLength: number;
  valueStart: number;
  valueLength: number;
  valueKind: 'price_cents' | 'weight_grams';
  /**
   * true somente depois do protocolo de validação com leituras digitais reais
   * (PRD §8). Enquanto false, o app opera em modo de conferência.
   */
  validated: boolean;
};

/**
 * Layout CANDIDATO (hipótese, PRD §8): 2 | PPPPPP | VVVVV | D
 * Confere com as 3 etiquetas fornecidas (checksum válido e preço = total impresso),
 * mas apenas uma foi informada explicitamente; as outras são transcrições visuais.
 */
export const CANDIDATE_LAYOUT: BarcodeLayout = {
  prefix: '2',
  productStart: 1,
  productLength: 6,
  valueStart: 7,
  valueLength: 5,
  valueKind: 'price_cents',
  validated: false,
};

export type ParseErrorCode =
  | 'not_13_digits'
  | 'invalid_check_digit'
  | 'unknown_prefix'
  | 'invalid_layout'
  | 'zero_value';

export type ParsedBarcode = {
  raw: string;
  /** Código do produto normalizado, sem zeros à esquerda ("000003" -> "3"). */
  productCode: string;
  priceCents: number | null;
  weightGrams: number | null;
};

export type ParseResult =
  | { ok: true; value: ParsedBarcode }
  | { ok: false; error: ParseErrorCode; message: string };

const MESSAGES: Record<ParseErrorCode, string> = {
  not_13_digits: 'O código lido não tem 13 dígitos numéricos.',
  invalid_check_digit: 'Dígito verificador inválido. Leia a etiqueta novamente.',
  unknown_prefix: 'Esta etiqueta não é da balança (prefixo não configurado).',
  invalid_layout: 'Layout de código de barras mal configurado.',
  zero_value: 'A etiqueta indica valor zero. Confira a etiqueta.',
};

function fail(error: ParseErrorCode): ParseResult {
  return { ok: false, error, message: MESSAGES[error] };
}

export function normalizeScaleCode(code: string): string {
  const trimmed = code.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error('Código da balança deve conter apenas dígitos');
  return String(Number.parseInt(trimmed, 10));
}

export function isLayoutConsistent(layout: BarcodeLayout): boolean {
  const { prefix, productStart, productLength, valueStart, valueLength } = layout;
  if (!/^\d+$/.test(prefix)) return false;
  const ints = [productStart, productLength, valueStart, valueLength];
  if (!ints.every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (productLength < 1 || valueLength < 1) return false;
  // Campos não podem sobrepor o prefixo nem o dígito verificador (índice 12).
  if (productStart < prefix.length || valueStart < prefix.length) return false;
  if (productStart + productLength > 12 || valueStart + valueLength > 12) return false;
  const overlap =
    productStart < valueStart + valueLength && valueStart < productStart + productLength;
  return !overlap;
}

export function parseScaleBarcode(rawInput: string, layout: BarcodeLayout): ParseResult {
  const raw = rawInput.trim();
  if (!isThirteenDigits(raw)) return fail('not_13_digits');
  if (!isValidEan13(raw)) return fail('invalid_check_digit');
  if (!isLayoutConsistent(layout)) return fail('invalid_layout');
  if (!raw.startsWith(layout.prefix)) return fail('unknown_prefix');

  const productField = raw.slice(layout.productStart, layout.productStart + layout.productLength);
  const valueField = raw.slice(layout.valueStart, layout.valueStart + layout.valueLength);
  const value = Number.parseInt(valueField, 10);
  if (value === 0) return fail('zero_value');

  return {
    ok: true,
    value: {
      raw,
      productCode: normalizeScaleCode(productField),
      priceCents: layout.valueKind === 'price_cents' ? value : null,
      weightGrams: layout.valueKind === 'weight_grams' ? value : null,
    },
  };
}
