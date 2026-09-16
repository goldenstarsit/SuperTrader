import db from "../src/lib/database";
import { fillRepository } from "../src/database/repositories/fillRepository";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { positionRepository } from "../src/database/repositories/positionRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { PositionService } from "../src/services/positionService";

const main = () => {
  const symbol = "M10TESTUSDT";

  db.prepare("DELETE FROM fills WHERE symbol = ?").run(symbol);
  db.prepare("DELETE FROM dca_levels WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ?)").run(symbol);
  db.prepare("DELETE FROM orders WHERE symbol = ?").run(symbol);
  db.prepare("DELETE FROM positions WHERE symbol = ?").run(symbol);
  db.prepare("DELETE FROM trading_cycles WHERE symbol = ?").run(symbol);

  const cycleId = tradingCycleRepository.create({
    symbol,
    cycleNumber: 1,
    referencePrice: 100,
    configVersion: "1",
    configSnapshotJson: JSON.stringify({
      symbol,
      version: "1",
      dcaLevels: [],
      takeProfitPercent: 2,
      stopLossPercent: 50,
    }),
  });

  const initialOrderId = orderRepository.create({
    cycleId,
    symbol,
    clientOrderId: "M10-INITIAL",
    orderType: "INITIAL",
    side: "BUY",
    executionType: "MARKET",
    requestedQuoteQuantity: 2,
  });

  const dcaOrderId = orderRepository.create({
    cycleId,
    symbol,
    clientOrderId: "M10-DCA-1",
    orderType: "DCA",
    side: "BUY",
    executionType: "LIMIT_MAKER",
    dcaLevel: 1,
    requestedPrice: 95,
    requestedQuantity: 0.01,
  });

  const sellOrderId = orderRepository.create({
    cycleId,
    symbol,
    clientOrderId: "M10-SELL",
    orderType: "TAKE_PROFIT",
    side: "SELL",
    executionType: "LIMIT_MAKER",
    requestedPrice: 102,
    requestedQuantity: 0.02,
  });

  fillRepository.create({
    orderId: initialOrderId,
    cycleId,
    symbol,
    exchangeTradeId: "M10-TRADE-1",
    quantity: 0.01,
    price: 100,
    fee: 0,
    filledAt: "2026-01-01T00:00:01.000Z",
  });

  fillRepository.create({
    orderId: dcaOrderId,
    cycleId,
    symbol,
    exchangeTradeId: "M10-TRADE-2",
    quantity: 0.01,
    price: 95,
    fee: 0,
    filledAt: "2026-01-01T00:00:02.000Z",
  });

  fillRepository.create({
    orderId: sellOrderId,
    cycleId,
    symbol,
    exchangeTradeId: "M10-TRADE-3",
    quantity: 0.005,
    price: 102,
    fee: 0,
    filledAt: "2026-01-01T00:00:03.000Z",
  });

  const service = new PositionService();
  const result = service.rebuild(cycleId);

  if (Math.abs(result.quantity - 0.02) > 1e-12) {
    throw new Error(`Expected quantity 0.02, got ${result.quantity}`);
  }

  if (Math.abs((result.averagePrice ?? 0) - 97.5) > 1e-12) {
    throw new Error(
      `Expected average price 97.5, got ${result.averagePrice}`,
    );
  }

  if (Math.abs(result.investedAmount - 1.95) > 1e-12) {
    throw new Error(
      `Expected invested amount 1.95, got ${result.investedAmount}`,
    );
  }

  const saved = positionRepository.findByCycleId(cycleId);

  if (!saved) {
    throw new Error("Position was not persisted.");
  }

  if (Math.abs(saved.quantity - 0.02) > 1e-12) {
    throw new Error("Persisted quantity mismatch.");
  }

  if (Math.abs((saved.average_price ?? 0) - 97.5) > 1e-12) {
    throw new Error("Persisted average price mismatch.");
  }

  const secondRebuild = service.rebuild(cycleId);

  if (
    Math.abs(secondRebuild.quantity - 0.02) > 1e-12 ||
    Math.abs((secondRebuild.averagePrice ?? 0) - 97.5) > 1e-12 ||
    Math.abs(secondRebuild.investedAmount - 1.95) > 1e-12
  ) {
    throw new Error("Position rebuild is not deterministic.");
  }

  const loaded = service.get(cycleId);

  if (
    loaded.quantity !== secondRebuild.quantity ||
    loaded.averagePrice !== secondRebuild.averagePrice ||
    loaded.investedAmount !== secondRebuild.investedAmount
  ) {
    throw new Error("Persisted position readback mismatch.");
  }

  db.prepare("DELETE FROM fills WHERE cycle_id = ?").run(cycleId);
  db.prepare("DELETE FROM dca_levels WHERE cycle_id = ?").run(cycleId);
  db.prepare("DELETE FROM orders WHERE cycle_id = ?").run(cycleId);
  db.prepare("DELETE FROM positions WHERE cycle_id = ?").run(cycleId);
  db.prepare("DELETE FROM trading_cycles WHERE id = ?").run(cycleId);

  console.log("M10 POSITION ENGINE: PASS");
  console.log({
    quantity: result.quantity,
    averagePrice: result.averagePrice,
    investedAmount: result.investedAmount,
    sellFillIgnored: true,
    deterministicRebuild: true,
  });
  console.log("M10 TEST DATA: CLEANED");
};

try {
  main();
} finally {
  db.close();
}
