import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { SqlDriver, SqlValue } from './driver';

const DB_NAME = 'casadobife_pdv';

/** Driver nativo (Android). Arquivo SQLite fica no armazenamento interno do app. */
export class CapacitorSqliteDriver implements SqlDriver {
  private constructor(private readonly db: SQLiteDBConnection) {}

  static async open(): Promise<CapacitorSqliteDriver> {
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    const consistent = (await sqlite.checkConnectionsConsistency()).result;
    const exists = (await sqlite.isConnection(DB_NAME, false)).result;
    const db =
      consistent && exists
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
    await db.open();
    await db.execute('PRAGMA foreign_keys = ON;', false);
    return new CapacitorSqliteDriver(db);
  }

  async exec(sql: string) {
    await this.db.execute(sql, false);
  }

  async run(sql: string, params: SqlValue[] = []) {
    const r = await this.db.run(sql, params, false);
    return { changes: r.changes?.changes ?? 0, lastId: r.changes?.lastId ?? null };
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const r = await this.db.query(sql, params);
    return (r.values ?? []) as T[];
  }

  async begin() {
    await this.db.beginTransaction();
  }

  async commit() {
    await this.db.commitTransaction();
  }

  async rollback() {
    await this.db.rollbackTransaction();
  }
}
