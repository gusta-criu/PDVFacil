export type SqlValue = string | number | null;

/**
 * Abstração mínima sobre SQLite para que o mesmo repositório rode:
 * - no Android, via @capacitor-community/sqlite;
 * - no navegador (desenvolvimento) e nos testes, via sql.js (WASM).
 */
export interface SqlDriver {
  /** Executa um ou mais comandos sem parâmetros (DDL, migrações). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number; lastId: number | null }>;
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
