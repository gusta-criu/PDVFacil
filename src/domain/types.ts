export type PaymentMethod = 'pix' | 'cash' | 'card';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  cash: 'DINHEIRO',
  card: 'CARTAO',
};

export const PAYMENT_LABELS_UI: Record<PaymentMethod, string> = {
  pix: 'Pix',
  cash: 'Dinheiro',
  card: 'Cartão',
};

export type Product = {
  id: number;
  scaleCode: string;
  name: string;
  unit: 'kg' | 'un';
  active: boolean;
  /** Apenas referência; nunca substitui o preço codificado na etiqueta. */
  referencePriceCents: number | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemSource = 'barcode' | 'manual';

export type CartItem = {
  /** Id local único da linha: duas etiquetas iguais geram duas linhas. */
  lineId: string;
  source: ItemSource;
  productId: number | null;
  productName: string;
  barcodeRaw: string | null;
  priceCents: number;
  weightGrams: number | null;
  unitPriceCentsPerKg: number | null;
  addedAt: string;
};

export type Cart = {
  items: CartItem[];
  discountCents: number;
  discountReason: string | null;
  startedAt: string;
};

export type SaleStatus = 'completed' | 'cancelled';

export type Sale = {
  id: string;
  sequentialNumber: number;
  createdAt: string;
  businessDate: string;
  status: SaleStatus;
  subtotalCents: number;
  discountCents: number;
  discountReason: string | null;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentAmountCents: number;
  changeCents: number;
  printedAt: string | null;
  printCount: number;
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type SaleItem = {
  id: number;
  saleId: string;
  position: number;
  productId: number | null;
  productNameSnapshot: string;
  barcodeRaw: string | null;
  source: ItemSource;
  priceCents: number;
  weightGrams: number | null;
  unitPriceCentsPerKg: number | null;
};

export type SaleWithItems = Sale & { items: SaleItem[] };

export type StoreInfo = {
  name: string;
  /** Linhas extras no cabeçalho (endereço, telefone, CNPJ...). */
  headerLines: string[];
  footerLines: string[];
};

export const DEFAULT_STORE: StoreInfo = {
  name: 'CASA DO BIFE',
  headerLines: [],
  footerLines: ['Obrigado pela preferencia!'],
};
