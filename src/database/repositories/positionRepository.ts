import db from "../../lib/database";

export type TradingPosition = {
  id: number;
  cycle_id: number;
  symbol: string;
  quantity: number;
  average_price: number | null;
  invested_amount: number;
  updated_at: string;
};

export const positionRepository = {
  create(cycleId: number, symbol: string): number {
    const result = db.prepare(`
      INSERT INTO positions (cycle_id, symbol)
      VALUES (?, ?)
    `).run(cycleId, symbol);

    return Number(result.lastInsertRowid);
  },

  findByCycleId(cycleId: number): TradingPosition | undefined {
    return db
      .prepare("SELECT * FROM positions WHERE cycle_id = ?")
      .get(cycleId) as TradingPosition | undefined;
  },

  update(
    cycleId: number,
    quantity: number,
    averagePrice: number | null,
    investedAmount: number,
  ): void {
    db.prepare(`
      UPDATE positions
      SET quantity = ?,
          average_price = ?,
          invested_amount = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE cycle_id = ?
    `).run(quantity, averagePrice, investedAmount, cycleId);
  },
};
