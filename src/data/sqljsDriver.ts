import type { Database } from 'sql.js';
import type { SqlDriver, SqlValue } from './driver';

/**
 * Driver sql.js. `onCommit` é chamado após cada escrita confirmada, para que o
 * modo navegador possa persistir o arquivo do banco (ex.: IndexedDB).
 */
export class SqlJsDriver implements SqlDriver {
  private inTx = false;

  constructor(
    readonly db: Database,
    private readonly onCommit: (db: Database) => void | Promise<void> = () => {},
  ) {}

  async exec(sql: string): Promise<void> {
    this.db.exec(sql);
    if (!this.inTx) await this.onCommit(this.db);
  }

  async run(sql: string, params: SqlValue[] = []) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const row = this.db.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0];
    if (!this.inTx) await this.onCommit(this.db);
    return { changes, lastId: typeof row === 'number' ? row : null };
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async begin() {
    this.db.exec('BEGIN IMMEDIATE');
    this.inTx = true;
  }

  async commit() {
    this.db.exec('COMMIT');
    this.inTx = false;
    await this.onCommit(this.db);
  }

  async rollback() {
    this.inTx = false;
    this.db.exec('ROLLBACK');
  }
}
