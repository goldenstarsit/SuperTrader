import type Database from "better-sqlite3";

export const version = 3;

export function up(db: Database.Database): void {
  const duplicateInitial = db
    .prepare(`
      SELECT cycle_id
      FROM orders
      WHERE order_type = 'INITIAL'
        AND side = 'BUY'
      GROUP BY cycle_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { cycle_id: number } | undefined;

  if (duplicateInitial) {
    throw new Error(
      `Migration 3 aborted: duplicate INITIAL BUY orders exist for cycle ${duplicateInitial.cycle_id}.`,
    );
  }

  const duplicateDca = db
    .prepare(`
      SELECT cycle_id, dca_level
      FROM orders
      WHERE order_type = 'DCA'
        AND side = 'BUY'
        AND dca_level IS NOT NULL
      GROUP BY cycle_id, dca_level
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { cycle_id: number; dca_level: number } | undefined;

  if (duplicateDca) {
    throw new Error(
      `Migration 3 aborted: duplicate DCA order exists for cycle ${duplicateDca.cycle_id}, level ${duplicateDca.dca_level}.`,
    );
  }

  const duplicateTakeProfit = db
    .prepare(`
      SELECT cycle_id
      FROM orders
      WHERE order_type = 'TAKE_PROFIT'
        AND side = 'SELL'
      GROUP BY cycle_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { cycle_id: number } | undefined;

  if (duplicateTakeProfit) {
    throw new Error(
      `Migration 3 aborted: duplicate TAKE_PROFIT orders exist for cycle ${duplicateTakeProfit.cycle_id}.`,
    );
  }

  const duplicateStopLoss = db
    .prepare(`
      SELECT cycle_id
      FROM orders
      WHERE order_type = 'STOP_LOSS'
        AND side = 'SELL'
      GROUP BY cycle_id
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { cycle_id: number } | undefined;

  if (duplicateStopLoss) {
    throw new Error(
      `Migration 3 aborted: duplicate STOP_LOSS orders exist for cycle ${duplicateStopLoss.cycle_id}.`,
    );
  }

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_initial_buy_cycle
      ON orders(cycle_id)
      WHERE order_type = 'INITIAL'
        AND side = 'BUY';

    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_dca_buy_cycle_level
      ON orders(cycle_id, dca_level)
      WHERE order_type = 'DCA'
        AND side = 'BUY'
        AND dca_level IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_take_profit_sell_cycle
      ON orders(cycle_id)
      WHERE order_type = 'TAKE_PROFIT'
        AND side = 'SELL';

    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_stop_loss_sell_cycle
      ON orders(cycle_id)
      WHERE order_type = 'STOP_LOSS'
        AND side = 'SELL';

    CREATE INDEX IF NOT EXISTS idx_orders_cycle_side_status
      ON orders(cycle_id, side, status);
  `);
}
