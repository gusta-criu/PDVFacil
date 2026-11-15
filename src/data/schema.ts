/**
 * Migrações versionadas (PRAGMA user_version). Nunca editar uma migração já
 * publicada; sempre acrescentar uma nova.
 */

/** Gatilhos que impedem alteração silenciosa de vendas concluídas (PRD §6). */
export const IMMUTABILITY_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS sales_financial_immutable
BEFORE UPDATE OF id, sequential_number, created_at, business_date, subtotal_cents,
  discount_cents, discount_reason, total_cents, payment_method, payment_amount_cents, change_cents
ON sales
BEGIN
  SELECT RAISE(ABORT, 'Venda concluida nao pode ser alterada');
END;

CREATE TRIGGER IF NOT EXISTS sales_no_uncancel
BEFORE UPDATE OF status ON sales
WHEN OLD.status = 'cancelled' AND NEW.status <> 'cancelled'
BEGIN
  SELECT RAISE(ABORT, 'Venda cancelada nao pode ser reativada');
END;

CREATE TRIGGER IF NOT EXISTS sales_no_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'Venda nao pode ser apagada');
END;

CREATE TRIGGER IF NOT EXISTS sale_items_no_update
BEFORE UPDATE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'Itens de venda nao podem ser alterados');
END;

CREATE TRIGGER IF NOT EXISTS sale_items_no_delete
BEFORE DELETE ON sale_items
BEGIN
  SELECT RAISE(ABORT, 'Itens de venda nao podem ser apagados');
END;
`;

export const DROP_IMMUTABILITY_TRIGGERS = `
DROP TRIGGER IF EXISTS sales_financial_immutable;
DROP TRIGGER IF EXISTS sales_no_uncancel;
DROP TRIGGER IF EXISTS sales_no_delete;
DROP TRIGGER IF EXISTS sale_items_no_update;
DROP TRIGGER IF EXISTS sale_items_no_delete;
`;

export const MIGRATIONS: string[] = [
  // v1
  `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scale_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'un')),
  active INTEGER NOT NULL DEFAULT 1,
  reference_price_cents INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  sequential_number INTEGER NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  business_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('completed', 'cancelled')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  discount_reason TEXT,
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'cash', 'card')),
  payment_amount_cents INTEGER NOT NULL,
  change_cents INTEGER NOT NULL DEFAULT 0,
  printed_at TEXT,
  print_count INTEGER NOT NULL DEFAULT 0,
  cancelled_at TEXT,
  cancel_reason TEXT,
  CHECK (total_cents = subtotal_cents - discount_cents)
);
CREATE INDEX IF NOT EXISTS idx_sales_business_date ON sales (business_date);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  position INTEGER NOT NULL,
  product_id INTEGER REFERENCES products (id),
  product_name_snapshot TEXT NOT NULL,
  barcode_raw TEXT,
  source TEXT NOT NULL CHECK (source IN ('barcode', 'manual')),
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  weight_grams INTEGER,
  unit_price_cents_per_kg INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items (sale_id);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS print_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id TEXT NOT NULL REFERENCES sales (id),
  attempted_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  is_reprint INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  sale_id TEXT,
  details TEXT
);

CREATE TABLE IF NOT EXISTS label_validations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  barcode_raw TEXT NOT NULL,
  product_label TEXT NOT NULL,
  printed_total_cents INTEGER NOT NULL,
  decoded_product_code TEXT,
  decoded_value INTEGER,
  matches INTEGER NOT NULL
);
${IMMUTABILITY_TRIGGERS}
`,
];

export const SCHEMA_VERSION = MIGRATIONS.length;
