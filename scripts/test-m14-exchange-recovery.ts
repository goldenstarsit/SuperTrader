import { MexcApiError } from "../src/exchange/mexcError";
import assert from "node:assert/strict";
import db from "../src/lib/database";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { mexcClient } from "../src/exchange/mexcClient";
import { mexcSymbolRulesService } from "../src/exchange/mexcSymbolRules";
import { mexcAccountService } from "../src/exchange/mexcAccountService";
import { InitialMarketBuyService } from "../src/services/initialMarketBuyService";
import { DcaEngineService } from "../src/services/dcaEngineService";

const symbol = "M14RECOVERYUSDT";

const rules = {
  symbol,
  status: "1",
  baseAsset: "M14RECOVERY",
  quoteAsset: "USDT",
  baseAssetPrecision: 8,
  quotePrecision: 8,
  quoteAssetPrecision: 8,
  baseCommissionPrecision: 8,
  quoteCommissionPrecision: 8,
  baseSizePrecision: 0.001,
  quoteAmountPrecision: 0.000001,
  quoteAmountPrecisionMarket: 1,
  maxQuoteAmount: 4000000,
  maxQuoteAmountMarket: 4000000,
  orderTypes: ["MARKET", "LIMIT_MAKER"],
  quoteOrderQtyMarketAllowed: true,
  isSpotTradingAllowed: true,
  isMarginTradingAllowed: false,
  permissions: [],
  filters: [],
  makerCommission: 0,
  takerCommission: 0,
};

async function main() {
  const originalGetRules = mexcSymbolRulesService.getRules;
  const originalGetAccount = mexcAccountService.getFreeBalance;
  const originalGetOrder = mexcClient.getOrder;
  const originalPlaceMarketBuy = mexcClient.placeMarketBuy;
  const originalPlaceLimitMakerBuy = mexcClient.placeLimitMakerBuy;

  const cycleIds: number[] = [];
  let marketBuyCalls = 0;
  let dcaBuyCalls = 0;

  try {
    mexcSymbolRulesService.getRules = async () => rules;
    mexcAccountService.getFreeBalance = async () => ({
      asset: "M14RECOVERY",
      free: 1,
    });

    mexcClient.placeMarketBuy = async (
      submittedSymbol,
      quoteOrderQty,
      clientOrderId,
    ) => {
      marketBuyCalls += 1;
      return {
        symbol: submittedSymbol,
        orderId: `M14-FAKE-INITIAL-${clientOrderId}`,
        type: "MARKET",
        side: "BUY",
        origQty: String(quoteOrderQty),
      };
    };

    mexcClient.placeLimitMakerBuy = async (
      submittedSymbol,
      quantity,
      price,
      clientOrderId,
    ) => {
      dcaBuyCalls += 1;
      return {
        symbol: submittedSymbol,
        orderId: `M14-FAKE-DCA-${clientOrderId}`,
        type: "LIMIT_MAKER",
        side: "BUY",
        price: String(price),
        origQty: String(quantity),
      };
    };

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
        dcaLevels: [
          { level: 1, dropPercent: 1 },
        ],
      }),
    });
    cycleIds.push(cycleId);

    const initialService = new InitialMarketBuyService(mexcClient);

    mexcClient.getOrder = async () => {
      throw new MexcApiError("M14 fake order not found", {
        status: 400,
        code: -2013,
        responseMessage: "Order does not exist",
      });
    };

    const preparedInitial = await initialService.prepare(cycleId, rules);
    assert.equal(preparedInitial.created, true);
    assert.equal(preparedInitial.order.client_order_id, `st-initial-${cycleId}`);

    const firstInitialSubmit = await initialService.submit(cycleId, rules);
    assert.equal(firstInitialSubmit.submitted, true);
    assert.equal(marketBuyCalls, 1);

    const initialOrder = orderRepository.findById(preparedInitial.order.id);
    assert.ok(initialOrder);
    assert.equal(initialOrder.exchange_order_id, firstInitialSubmit.exchangeOrderId);

    const originalExchangeId = initialOrder.exchange_order_id;

    orderRepository.setExchangeOrderId(initialOrder.id, "");

    mexcClient.getOrder = async (
      submittedSymbol,
      orderId,
      origClientOrderId,
    ) => {
      assert.equal(submittedSymbol, symbol);
      assert.equal(orderId, undefined);
      assert.equal(origClientOrderId, `st-initial-${cycleId}`);
      return {
        symbol,
        orderId: originalExchangeId!,
        clientOrderId: origClientOrderId,
        price: "100",
        origQty: "0.02",
        executedQty: "0",
        cummulativeQuoteQty: "0",
        status: "NEW",
        type: "MARKET",
        side: "BUY",
      };
    };

    const recoveredInitial = await initialService.submit(cycleId, rules);
    assert.equal(recoveredInitial.submitted, false);
    assert.equal(
      recoveredInitial.reason,
      "INITIAL_ORDER_RECOVERED_FROM_EXCHANGE",
    );
    assert.equal(recoveredInitial.exchangeOrderId, originalExchangeId);
    assert.equal(marketBuyCalls, 1);

    const dcaService = new DcaEngineService(mexcClient);

    const evaluation = await dcaService.evaluate(cycleId, 99, rules);
    assert.equal(evaluation.length, 1);
    assert.equal(evaluation[0].action, "PREPARED");

      if (!("order" in evaluation[0])) {
        throw new Error("Expected prepared DCA evaluation to contain an order.");
      }
    const dcaOrderId = evaluation[0].order.id;
    const dcaOrder = orderRepository.findById(dcaOrderId);
    assert.ok(dcaOrder);
    assert.equal(dcaOrder.client_order_id, `st-dca-${cycleId}-1`);

    mexcClient.getOrder = async (
      submittedSymbol,
      orderId,
      origClientOrderId,
    ) => {
      assert.equal(submittedSymbol, symbol);
      assert.equal(orderId, undefined);
      assert.equal(origClientOrderId, `st-dca-${cycleId}-1`);
      return {
        symbol,
        orderId: `M14-FAKE-DCA-${origClientOrderId}`,
        clientOrderId: origClientOrderId,
        price: "99",
        origQty: "0.02",
        executedQty: "0",
        cummulativeQuoteQty: "0",
        status: "NEW",
        type: "LIMIT_MAKER",
        side: "BUY",
      };
    };

    const recoveredDca = await dcaService.submitPreparedOrder(dcaOrderId);

    assert.equal(recoveredDca.submitted, false);
    assert.equal(
      recoveredDca.reason,
      "DCA_ORDER_RECOVERED_FROM_EXCHANGE",
    );
    assert.equal(
      recoveredDca.exchangeOrderId,
      `M14-FAKE-DCA-st-dca-${cycleId}-1`,
    );
    assert.equal(dcaBuyCalls, 0);

    console.log("M14 EXCHANGE RECOVERY: PASS");
    console.log({
      cycleId,
      initialClientOrderId: initialOrder.client_order_id,
      initialRecovered: recoveredInitial.exchangeOrderId,
      initialExchangeSubmissionCount: marketBuyCalls,
      dcaClientOrderId: dcaOrder.client_order_id,
      dcaRecovered: recoveredDca.exchangeOrderId,
      dcaExchangeSubmissionCount: dcaBuyCalls,
    });
  } finally {
    mexcSymbolRulesService.getRules = originalGetRules;
    mexcAccountService.getFreeBalance = originalGetAccount;
    mexcClient.getOrder = originalGetOrder;
    mexcClient.placeMarketBuy = originalPlaceMarketBuy;
    mexcClient.placeLimitMakerBuy = originalPlaceLimitMakerBuy;

    for (const cycleId of cycleIds) {
      db.prepare("DELETE FROM fills WHERE cycle_id = ?").run(cycleId);
      db.prepare("DELETE FROM dca_levels WHERE cycle_id = ?").run(cycleId);
      db.prepare("DELETE FROM orders WHERE cycle_id = ?").run(cycleId);
      db.prepare("DELETE FROM positions WHERE cycle_id = ?").run(cycleId);
      db.prepare("DELETE FROM trading_cycles WHERE id = ?").run(cycleId);
    }

    console.log("M14 TEST DATA: CLEANED");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
