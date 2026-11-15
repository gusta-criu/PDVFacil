import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addItem, applyDiscount, emptyCart } from '../domain/cart';
import { CANDIDATE_LAYOUT } from '../domain/barcode';
import type { Cart, CartItem } from '../domain/types';
import { SqlJsDriver } from './sqljsDriver';
import { PdvRepository, RepositoryError } from './repository';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

async function newRepo(bytes?: Uint8Array) {
  const db = new SQL.Database(bytes);
  db.exec('PRAGMA foreign_keys = ON');
  const repo = new PdvRepository(new SqlJsDriver(db));
  await repo.migrate();
  return { repo, db };
}

let seq = 0;
function line(name: string, priceCents: number, raw: string | null = null): CartItem {
  return {
    lineId: `l${++seq}`,
    source: raw ? 'barcode' : 'manual',
    productId: null,
    productName: name,
    barcodeRaw: raw,
    priceCents,
    weightGrams: null,
    unitPriceCentsPerKg: null,
    addedAt: new Date().toISOString(),
  };
}

function prdCart(): Cart {
  let c = emptyCart();
  c = addItem(c, line('Patinho', 649, '2000003006496'));
  c = addItem(c, line('Maminha', 9048, '2000018090480'));
  c = addItem(c, line('Diversos', 20140, '2000000201405'));
  return c;
}

describe('repositório', () => {
  let repo: PdvRepository;
  let db: import('sql.js').Database;

  beforeEach(async () => {
    ({ repo, db } = await newRepo());
  });

  it('migração é idempotente', async () => {
    await repo.migrate();
    await repo.migrate();
    expect(await repo.listProducts()).toEqual([]);
  });

  it('cadastra, busca, edita e desativa produtos com código normalizado', async () => {
    const p = await repo.saveProduct({ scaleCode: '000003', name: 'Patinho' });
    expect(p.scaleCode).toBe('3');
    expect((await repo.getProductByScaleCode('3'))?.name).toBe('Patinho');
    await expect(repo.saveProduct({ scaleCode: '3', name: 'Outro' })).rejects.toThrow(RepositoryError);
    await repo.saveProduct({ id: p.id, scaleCode: '3', name: 'Patinho bovino', active: false });
    expect(await repo.listProducts()).toHaveLength(0);
    const all = await repo.listProducts({ includeInactive: true });
    expect(all[0]).toMatchObject({ name: 'Patinho bovino', active: false });
    await repo.saveProduct({ scaleCode: '18', name: 'Maminha' });
    expect((await repo.listProducts({ search: 'mam' })).map((x) => x.name)).toEqual(['Maminha']);
    expect((await repo.listProducts({ search: '0018' })).map((x) => x.name)).toEqual(['Maminha']);
  });

  it('conclui venda com número sequencial, itens e snapshot de nomes', async () => {
    const s1 = await repo.completeSale(prdCart(), { method: 'pix' });
    const s2 = await repo.completeSale(prdCart(), { method: 'cash', receivedCents: 30000 });
    expect(s1.sequentialNumber).toBe(1);
    expect(s2.sequentialNumber).toBe(2);
    expect(s1.totalCents).toBe(29837);
    expect(s1.items.map((i) => i.productNameSnapshot)).toEqual(['Patinho', 'Maminha', 'Diversos']);
    expect(s2.changeCents).toBe(163);
    expect(s2.paymentAmountCents).toBe(30000);
  });

  it('duas embalagens idênticas viram dois itens', async () => {
    let c = emptyCart();
    c = addItem(c, line('Patinho', 649, '2000003006496'));
    c = addItem(c, line('Patinho', 649, '2000003006496'));
    const sale = await repo.completeSale(c, { method: 'card' });
    expect(sale.items).toHaveLength(2);
    expect(sale.totalCents).toBe(1298);
  });

  it('persiste após "reiniciar" (reabrir o arquivo do banco)', async () => {
    const sale = await repo.completeSale(prdCart(), { method: 'pix' });
    const { repo: reopened } = await newRepo(db.export());
    const loaded = await reopened.getSale(sale.id);
    expect(loaded?.totalCents).toBe(29837);
    expect(loaded?.items).toHaveLength(3);
  });

  it('transação é atômica: falha no meio não deixa venda parcial', async () => {
    const bad = prdCart();
    // Item inválido (preço 0) passa da validação do domínio só se forçado; o CHECK do banco barra.
    bad.items.push({ ...line('Quebrado', 1), priceCents: 0 });
    await expect(repo.completeSale(bad, { method: 'pix' })).rejects.toThrow();
    expect(await repo.listSales()).toHaveLength(0);
    const items = db.exec('SELECT COUNT(*) FROM sale_items')[0].values[0][0];
    expect(items).toBe(0);
    // E o número sequencial não é "queimado".
    expect((await repo.completeSale(prdCart(), { method: 'pix' })).sequentialNumber).toBe(1);
  });

  it('rejeita checkout inválido', async () => {
    await expect(repo.completeSale(emptyCart(), { method: 'pix' })).rejects.toThrow('vazio');
    await expect(repo.completeSale(prdCart(), { method: 'cash', receivedCents: 100 })).rejects.toThrow('menor');
  });

  it('venda concluída não pode ser alterada nem apagada silenciosamente', async () => {
    const sale = await repo.completeSale(prdCart(), { method: 'pix' });
    expect(() => db.run('UPDATE sales SET total_cents = 1 WHERE id = ?', [sale.id])).toThrow(/nao pode ser alterada/);
    expect(() => db.run('DELETE FROM sales WHERE id = ?', [sale.id])).toThrow(/nao pode ser apagada/);
    expect(() => db.run('UPDATE sale_items SET price_cents = 1')).toThrow(/nao podem ser alterados/);
    expect(() => db.run('DELETE FROM sale_items')).toThrow(/nao podem ser apagados/);
  });

  it('cancelamento é registrado, auditado e não pode ser revertido', async () => {
    const sale = await repo.completeSale(prdCart(), { method: 'pix' });
    await expect(repo.cancelSale(sale.id, '  ')).rejects.toThrow('motivo');
    const c = await repo.cancelSale(sale.id, 'cliente desistiu');
    expect(c.status).toBe('cancelled');
    await expect(repo.cancelSale(sale.id, 'de novo')).rejects.toThrow('já cancelada');
    expect(() => db.run("UPDATE sales SET status = 'completed'")).toThrow(/reativada/);
    expect((await repo.listAudit()).some((a) => a.action === 'sale_cancelled' && a.saleId === sale.id)).toBe(true);
  });

  it('fechamento diário confere com a soma das vendas persistidas', async () => {
    const day = new Date(2026, 10, 15, 10, 0);
    const other = new Date(2026, 10, 14, 18, 0);
    await repo.completeSale(prdCart(), { method: 'pix' }, day);
    const cashSale = await repo.completeSale(prdCart(), { method: 'cash', receivedCents: 30000 }, day);
    const d = applyDiscount(prdCart(), 37, 'arredondamento');
    if (!d.ok) throw new Error();
    await repo.completeSale(d.cart, { method: 'card' }, day);
    const cancelled = await repo.completeSale(prdCart(), { method: 'pix' }, day);
    await repo.cancelSale(cancelled.id, 'erro');
    await repo.completeSale(prdCart(), { method: 'pix' }, other);

    const closing = await repo.dailyClosing('2026-11-15');
    expect(closing.salesCount).toBe(3);
    expect(closing.totalCents).toBe(29837 * 3 - 37);
    expect(closing.byPayment.pix.totalCents).toBe(29837);
    expect(closing.byPayment.cash.totalCents).toBe(29837);
    expect(closing.byPayment.card.totalCents).toBe(29800);
    expect(closing.cancelledCount).toBe(1);
    expect(cashSale.changeCents).toBe(163);

    const sql = db.exec(
      "SELECT SUM(total_cents) FROM sales WHERE business_date = '2026-11-15' AND status = 'completed'",
    )[0].values[0][0];
    expect(closing.totalCents).toBe(sql);
    expect(await repo.listBusinessDates()).toEqual(['2026-11-15', '2026-11-14']);
  });

  it('carrinho em andamento é recuperado e limpo ao concluir a venda', async () => {
    const cart = prdCart();
    await repo.saveOpenCart(cart);
    const { repo: reopened, db: db2 } = await newRepo(db.export());
    const recovered = await reopened.loadOpenCart();
    expect(recovered?.items).toHaveLength(3);
    await reopened.completeSale(recovered!, { method: 'pix' });
    expect(await reopened.loadOpenCart()).toBeNull();
    expect(db2.exec("SELECT * FROM app_settings WHERE key = 'open_cart'")).toEqual([]);
  });

  it('impressão com falha não altera a venda; reimpressão não duplica', async () => {
    const sale = await repo.completeSale(prdCart(), { method: 'pix' });
    await repo.recordPrintAttempt(sale.id, { ok: false, error: 'Impressora desconectada' }, false);
    let s = await repo.getSale(sale.id);
    expect(s?.printedAt).toBeNull();
    expect(s?.status).toBe('completed');
    await repo.recordPrintAttempt(sale.id, { ok: true }, false);
    await repo.recordPrintAttempt(sale.id, { ok: true }, true);
    s = await repo.getSale(sale.id);
    expect(s?.printCount).toBe(2);
    expect(s?.printedAt).not.toBeNull();
    expect(await repo.listSales()).toHaveLength(1);
    expect(await repo.listPrintAttempts(sale.id)).toHaveLength(3);
  });

  it('registra validações de etiqueta comparando com o total impresso', async () => {
    const ok = await repo.recordLabelValidation('2000003006496', 'Patinho', 649, CANDIDATE_LAYOUT);
    const bad = await repo.recordLabelValidation('2000003006496', 'Patinho', 650, CANDIDATE_LAYOUT);
    const invalid = await repo.recordLabelValidation('2000003006497', 'Patinho', 649, CANDIDATE_LAYOUT);
    expect(ok).toMatchObject({ matches: true, decodedProductCode: '3', decodedValue: 649 });
    expect(bad.matches).toBe(false);
    expect(invalid).toMatchObject({ matches: false, decodedValue: null });
    expect(await repo.listLabelValidations()).toHaveLength(3);
  });

  it('backup exporta e restaura tudo, com validação', async () => {
    await repo.saveProduct({ scaleCode: '3', name: 'Patinho' });
    const sale = await repo.completeSale(prdCart(), { method: 'pix' });
    await repo.cancelSale(sale.id, 'teste');
    await repo.completeSale(prdCart(), { method: 'card' });
    await repo.setSetting('store', { name: 'Casa do Bife' });
    const backup = JSON.parse(JSON.stringify(await repo.exportBackup()));

    const { repo: fresh, db: freshDb } = await newRepo();
    await fresh.saveProduct({ scaleCode: '99', name: 'Será apagado' });
    const r = await fresh.importBackup(backup);
    expect(r).toEqual({ sales: 2, products: 1 });
    expect((await fresh.listProducts()).map((p) => p.name)).toEqual(['Patinho']);
    expect((await fresh.getSale(sale.id))?.status).toBe('cancelled');
    expect(await fresh.getSetting('store', null)).toEqual({ name: 'Casa do Bife' });
    // Gatilhos de imutabilidade voltam a valer após restaurar.
    expect(() => freshDb.run('DELETE FROM sale_items')).toThrow(/nao podem ser apagados/);
    // Numeração continua de onde parou.
    expect((await fresh.completeSale(prdCart(), { method: 'pix' })).sequentialNumber).toBe(3);
  });

  it('backup inválido é rejeitado sem apagar dados atuais', async () => {
    await repo.completeSale(prdCart(), { method: 'pix' });
    await expect(repo.importBackup({ foo: 1 })).rejects.toThrow('não é um backup');
    const good = await repo.exportBackup();
    await expect(repo.importBackup({ ...good, schemaVersion: 999 })).rejects.toThrow('mais nova');
    const corrupted = JSON.parse(JSON.stringify(good));
    corrupted.tables.sales[0].hacker = 1;
    await expect(repo.importBackup(corrupted)).rejects.toThrow('coluna desconhecida');
    expect(await repo.listSales()).toHaveLength(1);
  });

  it('operações concorrentes não intercalam transações', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => repo.completeSale(prdCart(), { method: 'pix' })),
    );
    expect(results.map((r) => r.sequentialNumber).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
