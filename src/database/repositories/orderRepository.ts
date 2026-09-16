import db from "../../lib/database";

export type OrderStatus =
  | "PENDING"
  | "NEW"
  | "PARTIALLY_FILLED"
  | "FILLED"
  | "CANCELED"
  | "REJECTED"
  | "EXPIRED";

export type TradingOrder = {
  id: number;
  cycle_id: number;
  symbol: string;
  client_order_id: string;
  exchange_order_id: string | null;
  order_type: "INITIAL" | "DCA" | "TAKE_PROFIT" | "STOP_LOSS";
  side: "BUY" | "SELL";
  execution_type: "MARKET" | "LIMIT_MAKER";
  dca_level: number | null;
  requested_price: number | null;
  requested_quantity: number | null;
  executed_quantity: number;
  average_fill_price: number | null;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
};

export const orderRepository = {
  create(input: {
    cycleId: number;
    symbol: string;
    clientOrderId: string;
    orderType: TradingOrder["order_type"];
    side: TradingOrder["side"];
    executionType: TradingOrder["execution_type"];
    dcaLevel?: number;
    requestedPrice?: number;
    requestedQuantity?: number;
  }): number {
    const result = db.prepare(`
      INSERT INTO orders (
        cycle_id, symbol, client_order_id, order_type, side,
        execution_type, dca_level, requested_price, requested_quantity, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(
      input.cycleId,
      input.symbol,
      input.clientOrderId,
      input.orderType,
      input.side,
      input.executionType,
      input.dcaLevel ?? null,
      input.requestedPrice ?? null,
      input.requestedQuantity ?? null,
    );

    return Number(result.lastInsertRowid);
  },

  findById(id: number): TradingOrder | undefined {
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as
      | TradingOrder
      | undefined;
  },

  findByClientOrderId(clientOrderId: string): TradingOrder | undefined {
    return db
      .prepare("SELECT * FROM orders WHERE client_order_id = ?")
      .get(clientOrderId) as TradingOrder | undefined;
  },

  findByExchangeOrderId(exchangeOrderId: string): TradingOrder | undefined {
    return db
      .prepare("SELECT * FROM orders WHERE exchange_order_id = ?")
      .get(exchangeOrderId) as TradingOrder | undefined;
  },

  findByCycleId(cycleId: number): TradingOrder[] {
    return db
      .prepare("SELECT * FROM orders WHERE cycle_id = ? ORDER BY id")
      .all(cycleId) as TradingOrder[];
  },

  updateStatus(
    id: number,
    status: OrderStatus,
    executedQuantity?: number,
    averageFillPrice?: number,
  ): void {
    db.prepare(`
      UPDATE orders
      SET status = ?,
          executed_quantity = COALESCE(?, executed_quantity),
          average_fill_price = COALESCE(?, average_fill_price),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      status,
      executedQuantity ?? null,
      averageFillPrice ?? null,
      id,
    );
  },

  setExchangeOrderId(id: number, exchangeOrderId: string): void {
    db.prepare(`
      UPDATE orders
      SET exchange_order_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(exchangeOrderId, id);
  },
};
