import type Database from "better-sqlite3";

export const version = 2;

export function up(db: Database.Database): void {
  db.exec(`
    ALTER TABLE orders
      ADD COLUMN requested_quote_quantity REAL;

    CREATE INDEX IF NOT EXISTS idx_orders_requested_quote_quantity
      ON orders(requested_quote_quantity);
  `);
}
