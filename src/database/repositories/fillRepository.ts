import db from "../../lib/database";

export type TradingFill = {
  id: number;
  order_id: number;
  cycle_id: number;
  symbol: string;
  exchange_trade_id: string;
  quantity: number;
  price: number;
  fee: number;
  fee_asset: string | null;
  filled_at: string;
};

export const fillRepository = {
  create(input: {
    orderId: number;
    cycleId: number;
    symbol: string;
    exchangeTradeId: string;
    quantity: number;
    price: number;
    fee?: number;
    feeAsset?: string;
    filledAt: string;
  }): number {
    const result = db.prepare(`
      INSERT INTO fills (
        order_id, cycle_id, symbol, exchange_trade_id,
        quantity, price, fee, fee_asset, filled_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.orderId,
      input.cycleId,
      input.symbol,
      input.exchangeTradeId,
      input.quantity,
      input.price,
      input.fee ?? 0,
      input.feeAsset ?? null,
      input.filledAt,
    );

    return Number(result.lastInsertRowid);
  },

  findByCycleId(cycleId: number): TradingFill[] {
    return db
      .prepare("SELECT * FROM fills WHERE cycle_id = ? ORDER BY filled_at, id")
      .all(cycleId) as TradingFill[];
  },

  findByOrderId(orderId: number): TradingFill[] {
    return db
      .prepare("SELECT * FROM fills WHERE order_id = ? ORDER BY filled_at, id")
      .all(orderId) as TradingFill[];
  },

  findByExchangeTradeId(exchangeTradeId: string): TradingFill | undefined {
    return db
      .prepare("SELECT * FROM fills WHERE exchange_trade_id = ?")
      .get(exchangeTradeId) as TradingFill | undefined;
  },
};
