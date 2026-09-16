import assert from "node:assert/strict";
import db from "../src/lib/database";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { mexcClient } from "../src/exchange/mexcClient";
import { MexcApiError } from "../src/exchange/mexcError";
import { tpSlExecutionService } from "../src/services/tpSlExecutionService";

const symbol = "M14CLOSERECOVERYUSDT";

async function main() {
  let cycleId: number | undefined;
  const originalGetOrder = mexcClient.getOrder;
  const originalPlaceMarketSell = mexcClient.placeMarketSell;
  let placeSellCalls = 0;
  let lookupCalls = 0;

  try {
    cycleId = tradingCycleRepository.create({
      symbol,
      cycleNumber: tradingCycleRepository.getNextCycleNumber(symbol),
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

    const prepared = orderRepository.createCloseIfAbsent({
      cycleId,
      symbol,
      clientOrderId: `st-close-${cycleId}`,
      orderType: "TAKE_PROFIT",
      requestedQuantity: 0.02,
    });

    assert.equal(prepared.created, true);

    mexcClient.getOrder = async (
      submittedSymbol,
      _orderId,
      clientOrderId,
    ) => {
      lookupCalls += 1;
      assert.equal(submittedSymbol, symbol);
      assert.equal(clientOrderId, `st-close-${cycleId}`);

      if (lookupCalls === 1) {
        throw new MexcApiError("M14 fake order not found", {
          status: 400,
          code: -2013,
          responseMessage: "Order does not exist",
        });
      }

      return {
        symbol: submittedSymbol,
        orderId: `M14-FAKE-CLOSE-${clientOrderId}`,
        clientOrderId,
        price: "0",
        origQty: "0.02",
        executedQty: "0",
        cummulativeQuoteQty: "0",
        status: "NEW",
        type: "MARKET",
        side: "SELL",
      };
    };

    mexcClient.placeMarketSell = async (
      submittedSymbol,
      quantity,
      clientOrderId,
    ) => {
      placeSellCalls += 1;
      assert.equal(submittedSymbol, symbol);
      assert.equal(quantity, 0.02);
      assert.equal(clientOrderId, `st-close-${cycleId}`);

      return {
        symbol: submittedSymbol,
        orderId: `M14-FAKE-CLOSE-${clientOrderId}`,
        type: "MARKET",
        side: "SELL",
        origQty: String(quantity),
      };
    };

    const first = await tpSlExecutionService.submitCloseOrder(
      prepared.order.id,
    );

    assert.equal(first.exchangeOrderId, `M14-FAKE-CLOSE-st-close-${cycleId}`);
    assert.equal(placeSellCalls, 1);

    const persistedAfterFirst = orderRepository.findById(prepared.order.id);
    assert.ok(persistedAfterFirst);
    assert.equal(
      persistedAfterFirst.exchange_order_id,
      first.exchangeOrderId,
    );

    const second = await tpSlExecutionService.submitCloseOrder(
      prepared.order.id,
    );

    assert.equal(second.exchangeOrderId, first.exchangeOrderId);
    assert.equal(placeSellCalls, 1);

    console.log("M14 CLOSE EXCHANGE RECOVERY: PASS");
    console.log({
      cycleId,
      clientOrderId: prepared.order.client_order_id,
      exchangeOrderId: first.exchangeOrderId,
      exchangeLookupCalls: lookupCalls,
      exchangeSubmissionCalls: placeSellCalls,
      secondSubmissionReusedExisting: true,
    });
  } finally {
    mexcClient.getOrder = originalGetOrder;
    mexcClient.placeMarketSell = originalPlaceMarketSell;

    if (cycleId !== undefined) {
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
