import type Database from "better-sqlite3";

export const migration = {
  version: 1,

  up(db: Database.Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS trading_cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol TEXT NOT NULL,
        cycle_number INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('ACTIVE', 'CLOSED')
        ),
        reference_price REAL NOT NULL,
        config_version TEXT NOT NULL,
        config_snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        closed_at TEXT,
        UNIQUE(symbol, cycle_number)
      );

      CREATE INDEX IF NOT EXISTS idx_trading_cycles_symbol_status
        ON trading_cycles(symbol, status);

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        client_order_id TEXT NOT NULL UNIQUE,
        exchange_order_id TEXT UNIQUE,
        order_type TEXT NOT NULL CHECK (
          order_type IN ('INITIAL', 'DCA', 'TAKE_PROFIT', 'STOP_LOSS')
        ),
        side TEXT NOT NULL CHECK (
          side IN ('BUY', 'SELL')
        ),
        execution_type TEXT NOT NULL CHECK (
          execution_type IN ('MARKET', 'LIMIT_MAKER')
        ),
        dca_level INTEGER,
        requested_price REAL,
        requested_quantity REAL,
        executed_quantity REAL NOT NULL DEFAULT 0,
        average_fill_price REAL,
        status TEXT NOT NULL CHECK (
          status IN (
            'PENDING',
            'NEW',
            'PARTIALLY_FILLED',
            'FILLED',
            'CANCELED',
            'REJECTED',
            'EXPIRED'
          )
        ),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cycle_id) REFERENCES trading_cycles(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_cycle
        ON orders(cycle_id);

      CREATE INDEX IF NOT EXISTS idx_orders_cycle_type
        ON orders(cycle_id, order_type);

      CREATE INDEX IF NOT EXISTS idx_orders_exchange_id
        ON orders(exchange_order_id);

      CREATE TABLE IF NOT EXISTS fills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        cycle_id INTEGER NOT NULL,
        symbol TEXT NOT NULL,
        exchange_trade_id TEXT NOT NULL UNIQUE,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        fee REAL NOT NULL DEFAULT 0,
        fee_asset TEXT,
        filled_at TEXT NOT NULL,
        FOREIGN KEY (order_id) REFERENCES orders(id),
        FOREIGN KEY (cycle_id) REFERENCES trading_cycles(id)
      );

      CREATE INDEX IF NOT EXISTS idx_fills_order
        ON fills(order_id);

      CREATE INDEX IF NOT EXISTS idx_fills_cycle
        ON fills(cycle_id);

      CREATE TABLE IF NOT EXISTS positions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 0,
        average_price REAL,
        invested_amount REAL NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cycle_id) REFERENCES trading_cycles(id)
      );

      CREATE TABLE IF NOT EXISTS dca_levels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        drop_percent REAL NOT NULL,
        target_price REAL NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('PENDING', 'ORDERED', 'FILLED', 'SKIPPED')
        ),
        order_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(cycle_id, level),
        FOREIGN KEY (cycle_id) REFERENCES trading_cycles(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );

      CREATE INDEX IF NOT EXISTS idx_dca_levels_cycle_status
        ON dca_levels(cycle_id, status);
    `);
  },
};
