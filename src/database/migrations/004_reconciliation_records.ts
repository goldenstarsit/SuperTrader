import type Database from "better-sqlite3";

export const version = 4;

export function up(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reconciliation_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER,
      symbol TEXT NOT NULL,
      orders_checked INTEGER NOT NULL DEFAULT 0,
      orders_updated INTEGER NOT NULL DEFAULT 0,
      fills_checked INTEGER NOT NULL DEFAULT 0,
      fills_inserted INTEGER NOT NULL DEFAULT 0,
      mismatches_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'MISMATCH', 'FAILED')),
      error_message TEXT,
      started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      FOREIGN KEY (cycle_id) REFERENCES trading_cycles(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_reconciliation_records_cycle
      ON reconciliation_records(cycle_id);

    CREATE INDEX IF NOT EXISTS idx_reconciliation_records_symbol
      ON reconciliation_records(symbol);

    CREATE INDEX IF NOT EXISTS idx_reconciliation_records_started_at
      ON reconciliation_records(started_at);
  `);
}
