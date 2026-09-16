import db from "../../lib/database";

export type TradingCycle = {
  id: number;
  symbol: string;
  cycle_number: number;
  status: "ACTIVE" | "CLOSED";
  reference_price: number;
  config_version: string;
  config_snapshot_json: string;
  created_at: string;
  closed_at: string | null;
};

export const tradingCycleRepository = {
  create(input: {
    symbol: string;
    cycleNumber: number;
    referencePrice: number;
    configVersion: string;
    configSnapshotJson: string;
  }): number {
    const result = db.prepare(`
      INSERT INTO trading_cycles (
        symbol, cycle_number, status, reference_price,
        config_version, config_snapshot_json
      )
      VALUES (?, ?, 'ACTIVE', ?, ?, ?)
    `).run(
      input.symbol,
      input.cycleNumber,
      input.referencePrice,
      input.configVersion,
      input.configSnapshotJson,
    );

    return Number(result.lastInsertRowid);
  },

  findById(id: number): TradingCycle | undefined {
    return db
      .prepare("SELECT * FROM trading_cycles WHERE id = ?")
      .get(id) as TradingCycle | undefined;
  },

  findActiveBySymbol(symbol: string): TradingCycle | undefined {
    return db
      .prepare(`
        SELECT *
        FROM trading_cycles
        WHERE symbol = ? AND status = 'ACTIVE'
        ORDER BY cycle_number DESC
        LIMIT 1
      `)
      .get(symbol) as TradingCycle | undefined;
  },

  getNextCycleNumber(symbol: string): number {
    const row = db
      .prepare(`
        SELECT COALESCE(MAX(cycle_number), 0) + 1 AS next_number
        FROM trading_cycles
        WHERE symbol = ?
      `)
      .get(symbol) as { next_number: number };

    return row.next_number;
  },

  close(id: number): void {
    db.prepare(`
      UPDATE trading_cycles
      SET status = 'CLOSED',
          closed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'ACTIVE'
    `).run(id);
  },
};
