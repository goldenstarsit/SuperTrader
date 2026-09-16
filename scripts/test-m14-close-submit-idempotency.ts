import assert from "node:assert/strict";
import db from "../src/lib/database";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { mexcClient } from "../src/exchange/mexcClient";
import { MexcApiError } from "../src/exchange/mexcError";
import { tpSlExecutionService } from "../src/services/tpSlExecutionService";

const symbol = "M14SUBMITUSDT";

async function main() {
  let cycleId: number | undefined;
  const originalPlaceMarketSell = mexcClient.placeMarketSell;
  const originalGetOrder = mexcClient.getOrder;
  let submissionCount = 0;

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
      clientOrderId: `m14-submit-${cycleId}`,
      orderType: "TAKE_PROFIT",
      requestedQuantity: 0.02,
    });

    assert.equal(prepared.created, true);

    mexcClient.getOrder = async () => {
      throw new MexcApiError("M14 test: exchange order not found", {
        status: 404,
        code: -2013,
        responseMessage: "Order does not exist.",
      });
    };

    mexcClient.placeMarketSell = async (
      submittedSymbol,
      quantity,
      clientOrderId,
    ) => {
      submissionCount += 1;

      assert.equal(submittedSymbol, symbol);
      assert.equal(quantity, 0.02);

      return {
        symbol: submittedSymbol,
        orderId: `M14-FAKE-SELL-${clientOrderId}`,
        type: "MARKET",
        side: "SELL",
        origQty: String(quantity),
      };
    };

    const first = await tpSlExecutionService.submitCloseOrder(
      prepared.order.id,
    );

    const second = await tpSlExecutionService.submitCloseOrder(
      prepared.order.id,
    );

    assert.equal(submissionCount, 1);
    assert.equal(second.exchangeOrderId, first.exchangeOrderId);

    const persisted = orderRepository.findById(prepared.order.id);

    assert.ok(persisted);
    assert.equal(
      persisted.exchange_order_id,
      first.exchangeOrderId,
    );
    assert.equal(persisted.status, "NEW");

    console.log("M14 CLOSE SUBMISSION IDEMPOTENCY: PASS");
    console.log({
      cycleId,
      orderId: prepared.order.id,
      exchangeOrderId: first.exchangeOrderId,
      firstSubmission: true,
      secondSubmissionReusedExisting: true,
      exchangeSubmissionCount: submissionCount,
    });
  } finally {
    mexcClient.placeMarketSell = originalPlaceMarketSell;
    mexcClient.getOrder = originalGetOrder;

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
