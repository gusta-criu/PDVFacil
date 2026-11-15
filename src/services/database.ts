import { Capacitor } from '@capacitor/core';
import { PdvRepository } from '../data/repository';

/**
 * Abre o banco conforme a plataforma:
 * - Android: SQLite nativo (@capacitor-community/sqlite).
 * - Navegador (desenvolvimento/demonstração): sql.js persistido no IndexedDB.
 */
export async function openRepository(): Promise<PdvRepository> {
  if (Capacitor.isNativePlatform()) {
    const { CapacitorSqliteDriver } = await import('../data/capacitorDriver');
    const repo = new PdvRepository(await CapacitorSqliteDriver.open());
    await repo.migrate();
    return repo;
  }

  const [{ default: initSqlJs }, { default: wasmUrl }, { SqlJsDriver }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
    import('../data/sqljsDriver'),
  ]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idbGet();
  const db = new SQL.Database(saved ?? undefined);
  db.exec('PRAGMA foreign_keys = ON');
  const repo = new PdvRepository(new SqlJsDriver(db, (d) => idbPut(d.export())));
  await repo.migrate();
  return repo;
}

const IDB_NAME = 'casadobife_pdv_web';
const IDB_STORE = 'db';
const IDB_KEY = 'sqlite';

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const req = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
