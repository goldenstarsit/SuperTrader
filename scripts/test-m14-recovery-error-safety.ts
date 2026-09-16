import assert from "node:assert/strict";
import db from "../src/lib/database";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { mexcClient } from "../src/exchange/mexcClient";
import { MexcApiError } from "../src/exchange/mexcError";
import { InitialMarketBuyService } from "../src/services/initialMarketBuyService";
import { DcaEngineService } from "../src/services/dcaEngineService";
import { tpSlExecutionService } from "../src/services/tpSlExecutionService";

const symbol = "M14ERRSAFEUSDT";

async function main() {
  let cycleId: number | undefined;
  const originalGetOrder = mexcClient.getOrder;
  const originalPlaceMarketBuy = mexcClient.placeMarketBuy;
  const originalPlaceLimitMakerBuy = mexcClient.placeLimitMakerBuy;
  const originalPlaceMarketSell = mexcClient.placeMarketSell;

  let buyCalls = 0;
  let dcaCalls = 0;
  let sellCalls = 0;

  const rules = {
    symbol,
    status: "1",
    baseAsset: "M14ERRSAFE",
    quoteAsset: "USDT",
    baseAssetPrecision: 8,
    quotePrecision: 8,
    quoteAssetPrecision: 8,
    baseSizePrecision: 0.000001,
    quoteAmountPrecision: 1,
    quoteAmountPrecisionMarket: 1,
    maxQuoteAmount: 2000000,
    maxQuoteAmountMarket: 2000000,
    orderTypes: ["MARKET", "LIMIT", "LIMIT_MAKER"],
    isSpotTradingAllowed: true,
    makerCommission: 0,
    takerCommission: 0,
  };

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
        dcaLevels: [1],
      }),
    });

    mexcClient.getOrder = async () => {
      throw new MexcApiError("M14 simulated unauthorized/rate-limit error", {
        status: 429,
        code: -1003,
        responseMessage: "Too many requests",
      });
    };

    mexcClient.placeMarketBuy = async () => {
      buyCalls += 1;
      throw new Error("Initial BUY must not be submitted after non-not-found recovery error");
    };

    const initialService = new InitialMarketBuyService(mexcClient);

    await assert.rejects(
      () => initialService.submit(cycleId!, rules),
      /M14 simulated unauthorized\/rate-limit error/,
    );

    assert.equal(buyCalls, 0);

    const preparedDca = orderRepository.createDcaIfAbsent({
      cycleId,
      symbol,
      clientOrderId: `st-dca-${cycleId}-1`,
      dcaLevel: 1,
      requestedPrice: 99,
      requestedQuantity: 0.02,
    });

    assert.equal(preparedDca.created, true);

    mexcClient.placeLimitMakerBuy = async () => {
      dcaCalls += 1;
      throw new Error("DCA BUY must not be submitted after non-not-found recovery error");
    };

    const dcaService = new DcaEngineService(mexcClient);

    await assert.rejects(
      () => dcaService.submitPreparedOrder(preparedDca.order.id),
      /M14 simulated unauthorized\/rate-limit error/,
    );

    assert.equal(dcaCalls, 0);

    const preparedClose = orderRepository.createCloseIfAbsent({
      cycleId,
      symbol,
      clientOrderId: `st-close-${cycleId}`,
      orderType: "TAKE_PROFIT",
      requestedQuantity: 0.02,
    });

    assert.equal(preparedClose.created, true);

    mexcClient.placeMarketSell = async () => {
      sellCalls += 1;
      throw new Error("SELL must not be submitted after non-not-found recovery error");
    };

    await assert.rejects(
      () => tpSlExecutionService.submitCloseOrder(preparedClose.order.id),
      /M14 simulated unauthorized\/rate-limit error/,
    );

    assert.equal(sellCalls, 0);

    console.log("M14 RECOVERY ERROR SAFETY: PASS");
    console.log({
      cycleId,
      initialExchangeSubmissionCalls: buyCalls,
      dcaExchangeSubmissionCalls: dcaCalls,
      closeExchangeSubmissionCalls: sellCalls,
      nonNotFoundErrorBlockedAllSubmissions: true,
    });
  } finally {
    mexcClient.getOrder = originalGetOrder;
    mexcClient.placeMarketBuy = originalPlaceMarketBuy;
    mexcClient.placeLimitMakerBuy = originalPlaceLimitMakerBuy;
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
