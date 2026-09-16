import db from "../src/lib/database";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { DcaEngineService } from "../src/services/dcaEngineService";
import { calculateMinimumDcaBuyQuantity } from "../src/trading/dcaQuantityCalculator";

const fakeClient = {
  placeLimitMakerBuy: async (
    symbol: string,
    quantity: number,
    price: number,
    newClientOrderId: string,
  ) => ({
    symbol,
    orderId: "M9-FAKE-DCA-ORDER-1",
    type: "LIMIT_MAKER",
    side: "BUY",
    origQty: String(quantity),
    price: String(price),
    clientOrderId: newClientOrderId,
  }),
} as never;

const main = async () => {
  const snapshot = JSON.stringify({
    symbol: "M9TESTUSDT",
    configVersion: "1",
    dcaLevels: [
      { level: 1, dropPercent: 1 },
      { level: 2, dropPercent: 3 },
      { level: 3, dropPercent: 6 },
    ],
    takeProfitPercent: 2,
    stopLossPercent: 50,
  });

  const cycleId = tradingCycleRepository.create({
    symbol: "M9TESTUSDT",
    cycleNumber: 1,
    referencePrice: 100,
    configVersion: "1",
    configSnapshotJson: snapshot,
  });

  try {
    const service = new DcaEngineService(fakeClient);

    const init = service.initializeLevels(cycleId);

    if (init.created !== 3) {
      throw new Error(`Expected 3 DCA levels, got ${init.created}`);
    }

    const levelsAgain = service.initializeLevels(cycleId);

    if (levelsAgain.created !== 0) {
      throw new Error("DCA levels were duplicated.");
    }

    const rules = {
      symbol: "M9TESTUSDT",
      status: "1",
      baseAsset: "M9",
      quoteAsset: "USDT",
      baseAssetPrecision: 8,
      quotePrecision: 8,
      quoteAssetPrecision: 8,
      baseSizePrecision: 0.001,
      quoteAmountPrecision: 0.01,
      quoteAmountPrecisionMarket: 1,
      maxQuoteAmount: null,
      maxQuoteAmountMarket: null,
      orderTypes: ["LIMIT_MAKER"],
      isSpotTradingAllowed: true,
      makerCommission: 0,
      takerCommission: 0,
    };

    const results = await service.evaluate(cycleId, 99, rules);

    if (results.length !== 1) {
      throw new Error(`Expected one triggered DCA level, got ${results.length}`);
    }

    const orders = orderRepository.findByCycleId(cycleId);

    if (orders.length !== 1) {
      throw new Error(`Expected one DCA order, got ${orders.length}`);
    }

    if (orders[0].order_type !== "DCA") {
      throw new Error("Expected DCA order.");
    }

    if (orders[0].dca_level !== 1) {
      throw new Error("Expected DCA level 1.");
    }

    if (orders[0].execution_type !== "LIMIT_MAKER") {
      throw new Error("Expected LIMIT_MAKER.");
    }

    if (
      orders[0].requested_quantity === null ||
      orders[0].requested_price === null ||
      orders[0].requested_quantity * orders[0].requested_price <= 1
    ) {
      throw new Error("DCA notional must be greater than 1 USDT.");
    }

    const retry = await service.evaluate(cycleId, 99, rules);

    if (orderRepository.findByCycleId(cycleId).length !== 1) {
      throw new Error("DCA duplicate order created.");
    }

    if (!retry.some((item) => item.action === "EXISTS")) {
      throw new Error("Existing DCA order was not detected.");
    }

    const submitted = await service.submitPreparedOrder(orders[0].id);

    if (!submitted.submitted) {
      throw new Error("Expected first DCA submission.");
    }

    const secondSubmit = await service.submitPreparedOrder(orders[0].id);

    if (secondSubmit.submitted) {
      throw new Error("Duplicate DCA submission was allowed.");
    }

    const saved = orderRepository.findById(orders[0].id);

    if (saved?.exchange_order_id !== "M9-FAKE-DCA-ORDER-1") {
      throw new Error("Exchange order ID was not persisted.");
    }

    const quantity = calculateMinimumDcaBuyQuantity(99, {
      baseSizePrecision: 0.001,
    });

    if (quantity * 99 <= 1) {
      throw new Error("Quantity calculator produced invalid notional.");
    }

    console.log("M9 DCA ENGINE: PASS");
    console.log({
      levelsCreated: init.created,
      orders: orderRepository.findByCycleId(cycleId).length,
      dcaLevel: saved?.dca_level,
      quantity: saved?.requested_quantity,
      price: saved?.requested_price,
      notional: saved?.requested_quantity! * saved?.requested_price!,
      exchangeOrderId: saved?.exchange_order_id,
      duplicateSubmissionBlocked: secondSubmit.submitted === false,
    });
  } finally {
    db.prepare("DELETE FROM fills WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM dca_levels WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM orders WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM positions WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM trading_cycles WHERE id = ?").run(cycleId);
    console.log("M9 TEST DATA: CLEANED");
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
