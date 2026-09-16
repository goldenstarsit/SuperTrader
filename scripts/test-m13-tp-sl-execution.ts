import assert from "node:assert/strict";
import db from "../src/lib/database";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { positionRepository } from "../src/database/repositories/positionRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { mexcAccountService } from "../src/exchange/mexcAccountService";
import { mexcClient } from "../src/exchange/mexcClient";
import { mexcSymbolRulesService } from "../src/exchange/mexcSymbolRules";
import { tpSlExecutionService } from "../src/services/tpSlExecutionService";

const symbol = "M13TESTUSDT";

const rules = {
  symbol,
  status: "1",
  baseAsset: "M13TEST",
  quoteAsset: "USDT",
  baseAssetPrecision: 8,
  quotePrecision: 8,
  quoteAssetPrecision: 8,
  baseSizePrecision: 0.001,
  quoteAmountPrecision: 0.000001,
  quoteAmountPrecisionMarket: 1,
  maxQuoteAmount: 4000000,
  maxQuoteAmountMarket: 4000000,
  orderTypes: ["MARKET"],
  isSpotTradingAllowed: true,
  makerCommission: 0,
  takerCommission: 0,
};

async function main() {
  const cycleIds: number[] = [];

  const originalGetRules = mexcSymbolRulesService.getRules;
const originalGetFreeBalance = mexcAccountService.getFreeBalance;
const originalPlaceMarketSell = mexcClient.placeMarketSell;

try {
  mexcSymbolRulesService.getRules = async () => rules;
  mexcAccountService.getFreeBalance = async () => ({
    asset: "M13TEST",
    free: 0.01234,
  });

  mexcClient.placeMarketSell = async (
    submittedSymbol,
    quantity,
    clientOrderId,
  ) => ({
    symbol: submittedSymbol,
    orderId: `M13-FAKE-${clientOrderId}`,
    type: "MARKET",
    side: "SELL",
    origQty: String(quantity),
  });

  const cycleId = tradingCycleRepository.create({
    symbol,
    cycleNumber: 1,
    referencePrice: 100,
    configVersion: "1",
    configSnapshotJson: JSON.stringify({
      symbol,
      configVersion: "1",
      takeProfitPercent: 2,
      stopLossPercent: 50,
      dcaLevels: [],
    }),
  });

  cycleIds.push(cycleId);

  positionRepository.create(cycleId, symbol);
  positionRepository.update(cycleId, 0.02, 100, 2);

  const preparedTp = await tpSlExecutionService.prepareCloseOrder(
    cycleId,
    "TAKE_PROFIT",
  );

  assert.equal(preparedTp.quantity, 0.012);
  assert.equal(preparedTp.availableBalance, 0.01234);

  const tpOrder = orderRepository.findById(preparedTp.orderId);

  assert.ok(tpOrder);
  assert.equal(tpOrder.order_type, "TAKE_PROFIT");
  assert.equal(tpOrder.side, "SELL");
  assert.equal(tpOrder.execution_type, "MARKET");
  assert.equal(tpOrder.requested_quantity, 0.012);
  assert.equal(tpOrder.exchange_order_id, null);
  assert.equal(tpOrder.status, "PENDING");

  const submittedTp = await tpSlExecutionService.submitCloseOrder(
    preparedTp.orderId,
  );

  assert.equal(
    submittedTp.exchangeOrderId,
    `M13-FAKE-${tpOrder.client_order_id}`,
  );

  const persistedTp = orderRepository.findById(preparedTp.orderId);

  assert.ok(persistedTp);
  assert.equal(persistedTp.exchange_order_id, submittedTp.exchangeOrderId);
  assert.equal(persistedTp.status, "NEW");

  const preparedSl = await tpSlExecutionService.prepareCloseOrder(
    cycleId,
    "STOP_LOSS",
  );

  assert.equal(preparedSl.quantity, 0.012);
  assert.equal(preparedSl.trigger, "STOP_LOSS");

  const slOrder = orderRepository.findById(preparedSl.orderId);

  assert.ok(slOrder);
  assert.equal(slOrder.order_type, "STOP_LOSS");
  assert.equal(slOrder.side, "SELL");
  assert.equal(slOrder.requested_quantity, 0.012);

  console.log("M13 TP/SL EXECUTION PREPARATION: PASS");
  console.log({
    tpQuantity: preparedTp.quantity,
    slQuantity: preparedSl.quantity,
    tpExchangeOrderId: submittedTp.exchangeOrderId,
    slOrderStatus: slOrder.status,
    liveSellOrders: 0,
  });
} finally {
  mexcSymbolRulesService.getRules = originalGetRules;
  mexcAccountService.getFreeBalance = originalGetFreeBalance;
  mexcClient.placeMarketSell = originalPlaceMarketSell;

  for (const cycleId of cycleIds) {
    db.prepare("DELETE FROM fills WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM dca_levels WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM orders WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM positions WHERE cycle_id = ?").run(cycleId);
    db.prepare("DELETE FROM trading_cycles WHERE id = ?").run(cycleId);
  }

    console.log("M13 TEST DATA: CLEANED");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
