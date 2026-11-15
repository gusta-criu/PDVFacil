import { CANDIDATE_LAYOUT, normalizeScaleCode, parseScaleBarcode, type BarcodeLayout } from '../domain/barcode';
import { subtotalCents, totalCents, validateCheckout, type PaymentInput } from '../domain/cart';
import { summarizeDay, toBusinessDate, type DailyClosing } from '../domain/closing';
import type { Cart, Product, Sale, SaleItem, SaleWithItems } from '../domain/types';
import type { SqlDriver, SqlValue } from './driver';
import { DROP_IMMUTABILITY_TRIGGERS, IMMUTABILITY_TRIGGERS, MIGRATIONS, SCHEMA_VERSION } from './schema';

type Row = Record<string, SqlValue>;

const s = (v: SqlValue) => (v === null ? null : String(v));
const n = (v: SqlValue) => (v === null ? null : Number(v));

function toProduct(r: Row): Product {
  return {
    id: Number(r.id),
    scaleCode: String(r.scale_code),
    name: String(r.name),
    unit: r.unit === 'un' ? 'un' : 'kg',
    active: Number(r.active) === 1,
    referencePriceCents: n(r.reference_price_cents),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function toSale(r: Row): Sale {
  return {
    id: String(r.id),
    sequentialNumber: Number(r.sequential_number),
    createdAt: String(r.created_at),
    businessDate: String(r.business_date),
    status: r.status === 'cancelled' ? 'cancelled' : 'completed',
    subtotalCents: Number(r.subtotal_cents),
    discountCents: Number(r.discount_cents),
    discountReason: s(r.discount_reason),
    totalCents: Number(r.total_cents),
    paymentMethod: r.payment_method as Sale['paymentMethod'],
    paymentAmountCents: Number(r.payment_amount_cents),
    changeCents: Number(r.change_cents),
    printedAt: s(r.printed_at),
    printCount: Number(r.print_count),
    cancelledAt: s(r.cancelled_at),
    cancelReason: s(r.cancel_reason),
  };
}

function toSaleItem(r: Row): SaleItem {
  return {
    id: Number(r.id),
    saleId: String(r.sale_id),
    position: Number(r.position),
    productId: n(r.product_id),
    productNameSnapshot: String(r.product_name_snapshot),
    barcodeRaw: s(r.barcode_raw),
    source: r.source === 'manual' ? 'manual' : 'barcode',
    priceCents: Number(r.price_cents),
    weightGrams: n(r.weight_grams),
    unitPriceCentsPerKg: n(r.unit_price_cents_per_kg),
  };
}

export class RepositoryError extends Error {}

export const BACKUP_FORMAT = 'casa-do-bife-pdv-backup';
export const BACKUP_VERSION = 1;

const BACKUP_TABLES = [
  'products',
  'sales',
  'sale_items',
  'app_settings',
  'print_attempts',
  'audit_log',
  'label_validations',
] as const;

export type Backup = {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<(typeof BACKUP_TABLES)[number], Row[]>;
};

export type SaveProductInput = {
  id?: number;
  scaleCode: string;
  name: string;
  unit?: 'kg' | 'un';
  active?: boolean;
  referencePriceCents?: number | null;
};

export type LabelValidation = {
  id: number;
  at: string;
  barcodeRaw: string;
  productLabel: string;
  printedTotalCents: number;
  decodedProductCode: string | null;
  decodedValue: number | null;
  matches: boolean;
};

export class PdvRepository {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: SqlDriver) {}

  /** Serializa operações para que transações nunca se intercalem. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private tx<T>(fn: () => Promise<T>): Promise<T> {
    return this.serial(async () => {
      await this.db.begin();
      try {
        const result = await fn();
        await this.db.commit();
        return result;
      } catch (e) {
        await this.db.rollback();
        throw e;
      }
    });
  }

  async migrate(): Promise<void> {
    await this.serial(async () => {
      const [{ user_version }] = await this.db.all<{ user_version: number }>('PRAGMA user_version');
      if (user_version > SCHEMA_VERSION) {
        throw new RepositoryError(
          `Banco de dados é de uma versão mais nova do app (esquema ${user_version}). Atualize o aplicativo.`,
        );
      }
      for (let v = user_version; v < SCHEMA_VERSION; v++) {
        await this.db.begin();
        try {
          await this.db.exec(MIGRATIONS[v]);
          await this.db.exec(`PRAGMA user_version = ${v + 1}`);
          await this.db.commit();
        } catch (e) {
          await this.db.rollback();
          throw e;
        }
      }
    });
  }

  // ---------- Configurações ----------

  getSetting<T>(key: string, fallback: T): Promise<T> {
    return this.serial(async () => {
      const rows = await this.db.all<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
      if (rows.length === 0) return fallback;
      try {
        return JSON.parse(rows[0].value) as T;
      } catch {
        return fallback;
      }
    });
  }

  /** Leitura serializada: nunca enxerga dados de uma transação ainda aberta. */
  private read<T = Row>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.serial(() => this.db.all<T>(sql, params));
  }

  setSetting(key: string, value: unknown): Promise<void> {
    return this.serial(async () => {
      await this.db.run(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        [key, JSON.stringify(value)],
      );
    });
  }

  getLayout(): Promise<BarcodeLayout> {
    return this.getSetting('barcode_layout', CANDIDATE_LAYOUT);
  }

  /** Carrinho em andamento, salvo a cada alteração para recuperação após fechamento inesperado. */
  loadOpenCart(): Promise<Cart | null> {
    return this.getSetting<Cart | null>('open_cart', null);
  }

  saveOpenCart(cart: Cart | null): Promise<void> {
    if (cart === null || cart.items.length === 0) {
      return this.serial(async () => {
        await this.db.run("DELETE FROM app_settings WHERE key = 'open_cart'");
      });
    }
    return this.setSetting('open_cart', cart);
  }

  // ---------- Auditoria ----------

  audit(action: string, details?: unknown, saleId: string | null = null, now = new Date()): Promise<void> {
    return this.serial(async () => {
      await this.db.run('INSERT INTO audit_log (at, action, sale_id, details) VALUES (?, ?, ?, ?)', [
        now.toISOString(),
        action,
        saleId,
        details === undefined ? null : JSON.stringify(details),
      ]);
    });
  }

  async listAudit(limit = 200): Promise<{ at: string; action: string; saleId: string | null; details: string | null }[]> {
    const rows = await this.read('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', [limit]);
    return rows.map((r) => ({ at: String(r.at), action: String(r.action), saleId: s(r.sale_id), details: s(r.details) }));
  }

  // ---------- Produtos ----------

  async listProducts(opts: { search?: string; includeInactive?: boolean } = {}): Promise<Product[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (!opts.includeInactive) where.push('active = 1');
    const q = opts.search?.trim();
    if (q) {
      where.push('(name LIKE ? OR scale_code = ?)');
      params.push(`%${q}%`, /^\d+$/.test(q) ? normalizeScaleCode(q) : q);
    }
    const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE`;
    return (await this.read(sql, params)).map(toProduct);
  }

  async getProductByScaleCode(code: string): Promise<Product | null> {
    const rows = await this.read('SELECT * FROM products WHERE scale_code = ?', [normalizeScaleCode(code)]);
    return rows.length ? toProduct(rows[0]) : null;
  }

  saveProduct(input: SaveProductInput, now = new Date()): Promise<Product> {
    const name = input.name.trim();
    if (!name) return Promise.reject(new RepositoryError('Informe o nome do produto.'));
    let code: string;
    try {
      code = normalizeScaleCode(input.scaleCode);
    } catch {
      return Promise.reject(new RepositoryError('O código da balança deve conter apenas números.'));
    }
    const ref = input.referencePriceCents ?? null;
    if (ref !== null && (!Number.isSafeInteger(ref) || ref < 0)) {
      return Promise.reject(new RepositoryError('Preço de referência inválido.'));
    }
    return this.serial(async () => {
      const clash = await this.db.all<{ id: number }>('SELECT id FROM products WHERE scale_code = ?', [code]);
      if (clash.length && clash[0].id !== input.id) {
        throw new RepositoryError(`Já existe um produto com o código ${code}.`);
      }
      const ts = now.toISOString();
      const active = input.active === false ? 0 : 1;
      let id = input.id;
      if (id) {
        await this.db.run(
          'UPDATE products SET scale_code = ?, name = ?, unit = ?, active = ?, reference_price_cents = ?, updated_at = ? WHERE id = ?',
          [code, name, input.unit ?? 'kg', active, ref, ts, id],
        );
      } else {
        const r = await this.db.run(
          'INSERT INTO products (scale_code, name, unit, active, reference_price_cents, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [code, name, input.unit ?? 'kg', active, ref, ts, ts],
        );
        id = r.lastId ?? undefined;
      }
      const rows = await this.db.all<Row>('SELECT * FROM products WHERE id = ?', [id ?? null]);
      return toProduct(rows[0]);
    });
  }

  // ---------- Vendas ----------

  /**
   * Conclui a venda de forma atômica (PRD §6): número sequencial, venda, itens,
   * limpeza do carrinho em aberto e auditoria na mesma transação.
   */
  completeSale(cart: Cart, payment: PaymentInput, now = new Date()): Promise<SaleWithItems> {
    const check = validateCheckout(cart, payment);
    if (!check.ok) return Promise.reject(new RepositoryError(check.message));
    const id = crypto.randomUUID();
    const sub = subtotalCents(cart);
    const total = totalCents(cart);

    return this.tx(async () => {
      const [{ next }] = await this.db.all<{ next: number }>(
        'SELECT COALESCE(MAX(sequential_number), 0) + 1 AS next FROM sales',
      );
      await this.db.run(
        `INSERT INTO sales (id, sequential_number, created_at, business_date, status, subtotal_cents,
          discount_cents, discount_reason, total_cents, payment_method, payment_amount_cents, change_cents)
         VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          next,
          now.toISOString(),
          toBusinessDate(now),
          sub,
          cart.discountCents,
          cart.discountReason,
          total,
          payment.method,
          check.paymentAmountCents,
          check.changeCents,
        ],
      );
      for (const [pos, item] of cart.items.entries()) {
        await this.db.run(
          `INSERT INTO sale_items (sale_id, position, product_id, product_name_snapshot, barcode_raw, source,
            price_cents, weight_grams, unit_price_cents_per_kg)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            pos,
            item.productId,
            item.productName,
            item.barcodeRaw,
            item.source,
            item.priceCents,
            item.weightGrams,
            item.unitPriceCentsPerKg,
          ],
        );
      }
      await this.db.run("DELETE FROM app_settings WHERE key = 'open_cart'");
      if (cart.discountCents > 0) {
        await this.db.run('INSERT INTO audit_log (at, action, sale_id, details) VALUES (?, ?, ?, ?)', [
          now.toISOString(),
          'discount',
          id,
          JSON.stringify({ cents: cart.discountCents, reason: cart.discountReason }),
        ]);
      }
      const sale = await this.getSaleUnsafe(id);
      if (!sale) throw new RepositoryError('Falha ao gravar a venda.');
      return sale;
    });
  }

  private async getSaleUnsafe(id: string): Promise<SaleWithItems | null> {
    const rows = await this.db.all<Row>('SELECT * FROM sales WHERE id = ?', [id]);
    if (!rows.length) return null;
    const items = await this.db.all<Row>('SELECT * FROM sale_items WHERE sale_id = ? ORDER BY position', [id]);
    return { ...toSale(rows[0]), items: items.map(toSaleItem) };
  }

  getSale(id: string): Promise<SaleWithItems | null> {
    return this.serial(() => this.getSaleUnsafe(id));
  }

  async listSales(opts: { businessDate?: string; limit?: number } = {}): Promise<Sale[]> {
    const params: SqlValue[] = [];
    let sql = 'SELECT * FROM sales';
    if (opts.businessDate) {
      sql += ' WHERE business_date = ?';
      params.push(opts.businessDate);
    }
    sql += ' ORDER BY sequential_number DESC LIMIT ?';
    params.push(opts.limit ?? 500);
    return (await this.read(sql, params)).map(toSale);
  }

  async listBusinessDates(limit = 60): Promise<string[]> {
    const rows = await this.read<{ business_date: string }>(
      'SELECT DISTINCT business_date FROM sales ORDER BY business_date DESC LIMIT ?',
      [limit],
    );
    return rows.map((r) => r.business_date);
  }

  async dailyClosing(businessDate: string): Promise<DailyClosing> {
    const sales = await this.read('SELECT * FROM sales WHERE business_date = ?', [businessDate]);
    return summarizeDay(businessDate, sales.map(toSale));
  }

  /** Cancelamento registrado (não apaga): a venda sai do total do dia e aparece como cancelada. */
  cancelSale(id: string, reason: string, now = new Date()): Promise<SaleWithItems> {
    if (!reason.trim()) return Promise.reject(new RepositoryError('Informe o motivo do cancelamento.'));
    return this.tx(async () => {
      const r = await this.db.run(
        "UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ? AND status = 'completed'",
        [now.toISOString(), reason.trim(), id],
      );
      if (r.changes !== 1) throw new RepositoryError('Venda não encontrada ou já cancelada.');
      await this.db.run('INSERT INTO audit_log (at, action, sale_id, details) VALUES (?, ?, ?, ?)', [
        now.toISOString(),
        'sale_cancelled',
        id,
        JSON.stringify({ reason: reason.trim() }),
      ]);
      return (await this.getSaleUnsafe(id))!;
    });
  }

  /**
   * Registra tentativa de impressão. Sucesso no envio não garante que o papel saiu,
   * por isso printed_at é apenas informativo (PRD §7).
   */
  recordPrintAttempt(
    saleId: string,
    result: { ok: true } | { ok: false; error: string },
    isReprint: boolean,
    now = new Date(),
  ): Promise<void> {
    return this.tx(async () => {
      await this.db.run(
        'INSERT INTO print_attempts (sale_id, attempted_at, status, is_reprint, error_message) VALUES (?, ?, ?, ?, ?)',
        [saleId, now.toISOString(), result.ok ? 'sent' : 'failed', isReprint ? 1 : 0, result.ok ? null : result.error],
      );
      if (result.ok) {
        await this.db.run(
          'UPDATE sales SET printed_at = COALESCE(printed_at, ?), print_count = print_count + 1 WHERE id = ?',
          [now.toISOString(), saleId],
        );
      }
    });
  }

  async listPrintAttempts(saleId: string) {
    return this.read<{ attempted_at: string; status: string; is_reprint: number; error_message: string | null }>(
      'SELECT attempted_at, status, is_reprint, error_message FROM print_attempts WHERE sale_id = ? ORDER BY id',
      [saleId],
    );
  }

  // ---------- Validação de etiquetas (PRD §8, protocolo bloqueante) ----------

  recordLabelValidation(
    barcodeRaw: string,
    productLabel: string,
    printedTotalCents: number,
    layout: BarcodeLayout,
    now = new Date(),
  ): Promise<LabelValidation> {
    const parsed = parseScaleBarcode(barcodeRaw, layout);
    const decodedValue = parsed.ok ? (parsed.value.priceCents ?? parsed.value.weightGrams) : null;
    const decodedCode = parsed.ok ? parsed.value.productCode : null;
    const matches = parsed.ok && layout.valueKind === 'price_cents' && decodedValue === printedTotalCents;
    return this.serial(async () => {
      const r = await this.db.run(
        `INSERT INTO label_validations (at, barcode_raw, product_label, printed_total_cents,
          decoded_product_code, decoded_value, matches) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [now.toISOString(), barcodeRaw.trim(), productLabel.trim(), printedTotalCents, decodedCode, decodedValue, matches ? 1 : 0],
      );
      return {
        id: r.lastId ?? 0,
        at: now.toISOString(),
        barcodeRaw: barcodeRaw.trim(),
        productLabel: productLabel.trim(),
        printedTotalCents,
        decodedProductCode: decodedCode,
        decodedValue,
        matches,
      };
    });
  }

  async listLabelValidations(): Promise<LabelValidation[]> {
    const rows = await this.read('SELECT * FROM label_validations ORDER BY id DESC');
    return rows.map((r) => ({
      id: Number(r.id),
      at: String(r.at),
      barcodeRaw: String(r.barcode_raw),
      productLabel: String(r.product_label),
      printedTotalCents: Number(r.printed_total_cents),
      decodedProductCode: s(r.decoded_product_code),
      decodedValue: n(r.decoded_value),
      matches: Number(r.matches) === 1,
    }));
  }

  // ---------- Backup ----------

  async exportBackup(now = new Date()): Promise<Backup> {
    return this.serial(async () => {
      const tables = {} as Backup['tables'];
      for (const t of BACKUP_TABLES) tables[t] = await this.db.all<Row>(`SELECT * FROM ${t}`);
      return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        schemaVersion: SCHEMA_VERSION,
        exportedAt: now.toISOString(),
        tables,
      };
    });
  }

  /** Valida e substitui TODOS os dados. A UI deve pedir confirmação antes. */
  importBackup(data: unknown): Promise<{ sales: number; products: number }> {
    let backup: Backup;
    try {
      backup = validateBackup(data);
    } catch (e) {
      return Promise.reject(e);
    }
    return this.tx(async () => {
      await this.db.exec(DROP_IMMUTABILITY_TRIGGERS);
      for (const t of [...BACKUP_TABLES].reverse()) await this.db.run(`DELETE FROM ${t}`);
      for (const t of BACKUP_TABLES) {
        const columns = new Set(
          (await this.db.all<{ name: string }>(`PRAGMA table_info(${t})`)).map((c) => c.name),
        );
        for (const row of backup.tables[t]) {
          const keys = Object.keys(row);
          const unknown = keys.find((k) => !columns.has(k));
          if (unknown) throw new RepositoryError(`Backup inválido: coluna desconhecida ${t}.${unknown}`);
          await this.db.run(
            `INSERT INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
            keys.map((k) => row[k]),
          );
        }
      }
      await this.db.exec(IMMUTABILITY_TRIGGERS);
      return { sales: backup.tables.sales.length, products: backup.tables.products.length };
    });
  }
}

export function validateBackup(data: unknown): Backup {
  const b = data as Partial<Backup> | null;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) {
    throw new RepositoryError('Arquivo não é um backup do Casa do Bife PDV.');
  }
  if (b.version !== BACKUP_VERSION) throw new RepositoryError(`Versão de backup não suportada: ${b.version}`);
  if (typeof b.schemaVersion !== 'number' || b.schemaVersion > SCHEMA_VERSION) {
    throw new RepositoryError('Backup feito por uma versão mais nova do app. Atualize o aplicativo.');
  }
  if (!b.tables || typeof b.tables !== 'object') throw new RepositoryError('Backup sem dados.');
  for (const t of BACKUP_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (!Array.isArray(rows)) throw new RepositoryError(`Backup incompleto: tabela ${t} ausente.`);
    for (const r of rows) {
      if (!r || typeof r !== 'object') throw new RepositoryError(`Backup inválido na tabela ${t}.`);
      for (const v of Object.values(r)) {
        if (v !== null && typeof v !== 'string' && typeof v !== 'number') {
          throw new RepositoryError(`Backup inválido na tabela ${t}.`);
        }
      }
    }
  }
  return b as Backup;
}
