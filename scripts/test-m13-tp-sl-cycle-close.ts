import assert from "node:assert/strict";
import { mexcAccountService } from "../src/exchange/mexcAccountService";
import { mexcClient } from "../src/exchange/mexcClient";
import { mexcSymbolRulesService } from "../src/exchange/mexcSymbolRules";
import { fillRepository } from "../src/database/repositories/fillRepository";
import { orderRepository } from "../src/database/repositories/orderRepository";
import { positionRepository } from "../src/database/repositories/positionRepository";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { cycleLifecycleService } from "../src/services/cycleLifecycleService";
import { marketPriceService } from "../src/market/marketPriceService";
import { tpSlExecutionService } from "../src/services/tpSlExecutionService";
import { PositionService } from "../src/services/positionService";

async function main() {
  const cycleIds: number[] = [];
  const originalGetRules = mexcSymbolRulesService.getRules;
  const originalGetFreeBalance = mexcAccountService.getFreeBalance;
  const originalPlaceMarketSell = mexcClient.placeMarketSell;
  const originalGetOrder = mexcClient.getOrder;
  const originalGetMyTrades = mexcClient.getMyTrades;
  const originalGetPrice = marketPriceService.getPrice;

  const fakeRules = {
    symbol: "BTCUSDT",
    status: "1",
    baseAsset: "BTC",
    quoteAsset: "USDT",
    baseAssetPrecision: 6,
    quotePrecision: 2,
    quoteAssetPrecision: 2,
    baseSizePrecision: 0.001,
    quoteAmountPrecision: 0.01,
    quoteAmountPrecisionMarket: 1,
    maxQuoteAmount: 4000000,
    maxQuoteAmountMarket: 4000000,
    orderTypes: ["MARKET"],
    isSpotTradingAllowed: true,
    makerCommission: 0,
    takerCommission: 0,
  };

  let fakeSellCalls = 0;

  try {
    mexcSymbolRulesService.getRules = async () => fakeRules;
    mexcAccountService.getFreeBalance = async (asset: string) => ({
      asset,
      free: 0.02,
    });

    mexcClient.placeMarketSell = async (
      symbol: string,
      quantity: number,
      clientOrderId: string,
    ) => {
      fakeSellCalls += 1;
      return {
        symbol,
        orderId: `M13-CLOSE-${clientOrderId}`,
        clientOrderId,
        price: "100",
        origQty: String(quantity),
        executedQty: String(quantity),
        cummulativeQuoteQty: String(quantity * 100),
        status: "NEW",
        type: "MARKET",
        side: "SELL",
      };

    };

      mexcClient.getMyTrades = async (
        symbol: string,
        orderId?: string,
      ) => [
        {
          symbol,
          id: `M13-SELL-TRADE-${orderId ?? "UNKNOWN"}`,
          orderId: orderId ?? "UNKNOWN",
          price: "100",
          qty: "0.02",
          quoteQty: "2",
          commission: "0",
          commissionAsset: "USDT",
          time: Date.now(),
          isBuyerMaker: false,
          isBestMatch: true,
        },
      ];

    mexcClient.getOrder = async (
      symbol: string,
      orderId?: string,
    ) => ({
      symbol,
      orderId: orderId ?? "M13-CLOSE-1",
      price: "100",
      origQty: "0.02",
      executedQty: "0.02",
      cummulativeQuoteQty: "2",
      status: "FILLED",
      type: "MARKET",
      side: "SELL",
    });

    marketPriceService.getPrice = async (symbol: string) => ({
      symbol,
      bidPrice: 101,
      bidQuantity: 1,
      askPrice: 101.01,
      askQuantity: 1,
      price: 101.005,
      receivedAt: Date.now(),
    });

    const btcExisting = tradingCycleRepository.findActiveBySymbol("BTCUSDT");
    if (btcExisting) {
      tradingCycleRepository.close(btcExisting.id);
    }

    const ethExisting = tradingCycleRepository.findActiveBySymbol("ETHUSDT");
    if (ethExisting) {
      tradingCycleRepository.close(ethExisting.id);
    }


    const btc = cycleLifecycleService.ensureActiveCycle({
      symbol: "BTCUSDT",
      bidPrice: 100,
      bidQuantity: 1,
      askPrice: 100.01,
      askQuantity: 1,
      price: 100.005,
      receivedAt: Date.now(),
    });

    const eth = cycleLifecycleService.ensureActiveCycle({
      symbol: "ETHUSDT",
      bidPrice: 200,
      bidQuantity: 1,
      askPrice: 200.01,
      askQuantity: 1,
      price: 200.005,
      receivedAt: Date.now(),
    });

    cycleIds.push(btc.cycleId, eth.cycleId);

    const expectedBtcCycleNumber = btc.cycleNumber;
    const expectedEthCycleNumber = eth.cycleNumber;

    assert.ok(expectedBtcCycleNumber >= 1);
    assert.ok(expectedEthCycleNumber >= 1);

    positionRepository.create(btc.cycleId, "BTCUSDT");
    positionRepository.update(btc.cycleId, 0.02, 100, 2);

    const prepared = await tpSlExecutionService.prepareCloseOrder(
      btc.cycleId,
      "TAKE_PROFIT",
    );

    assert.equal(prepared.quantity, 0.02);

    const submitted = await tpSlExecutionService.submitCloseOrder(
      prepared.orderId,
    );

    assert.ok(submitted.exchangeOrderId.startsWith("M13-CLOSE-"));

    const synced = await tpSlExecutionService.syncCloseOrder(
      prepared.orderId,
    );

    assert.equal(synced.order?.status, "FILLED");
    assert.equal(synced.executedQuantity, 0.02);
    assert.equal(synced.fills.length, 1);

    const syncedAgain = await tpSlExecutionService.syncCloseOrder(
      prepared.orderId,
    );

    assert.equal(syncedAgain.fills.length, 1);

    const closed = await tpSlExecutionService.closeCycleAfterFilledSell(
      prepared.orderId,
    );

    assert.equal(closed.closedCycleId, btc.cycleId);
    assert.equal(closed.closedSymbol, "BTCUSDT");
    assert.equal(closed.closedCycleNumber, expectedBtcCycleNumber);
    assert.equal(
      closed.nextCycleNumber,
      expectedBtcCycleNumber + 1,
    );

    const closedCycle = tradingCycleRepository.findById(btc.cycleId);
    assert.equal(closedCycle?.status, "CLOSED");

    const closedPosition = positionRepository.findByCycleId(btc.cycleId);
    assert.equal(closedPosition?.quantity, 0);
    assert.equal(closedPosition?.average_price, null);
    assert.equal(closedPosition?.invested_amount, 0);

    const nextBtc = tradingCycleRepository.findActiveBySymbol("BTCUSDT");
    assert.ok(nextBtc);
    assert.equal(nextBtc.cycle_number, expectedBtcCycleNumber + 1);

    const stillEth = tradingCycleRepository.findActiveBySymbol("ETHUSDT");
    assert.ok(stillEth);
    assert.equal(stillEth.id, eth.cycleId);
    assert.equal(stillEth.cycle_number, expectedEthCycleNumber);

    const closeOrder = orderRepository.findById(prepared.orderId);
    assert.equal(closeOrder?.status, "FILLED");
    assert.equal(closeOrder?.executed_quantity, 0.02);

    const fills = fillRepository.findByOrderId(prepared.orderId);
    assert.equal(fills.length, 1);

    console.log("M13 TP/SL CYCLE CLOSE: PASS");
    console.log({
      sellQuantity: prepared.quantity,
      sellFilledQuantity: synced.executedQuantity,
      sellFills: synced.fills.length,
      closedCycle: closed.closedCycleNumber,
      nextBtcCycle: closed.nextCycleNumber,
      ethCycleUnchanged: stillEth.cycle_number,
      positionAfterClose: closedPosition?.quantity,
      duplicateFillSync: syncedAgain.fills.length,
      liveSellOrders: fakeSellCalls,
    });
  } finally {
    mexcSymbolRulesService.getRules = originalGetRules;
    mexcAccountService.getFreeBalance = originalGetFreeBalance;
    mexcClient.placeMarketSell = originalPlaceMarketSell;
    mexcClient.getOrder = originalGetOrder;
    mexcClient.getMyTrades = originalGetMyTrades;
    marketPriceService.getPrice = originalGetPrice;

    for (const cycleId of cycleIds) {
      const cycle = tradingCycleRepository.findById(cycleId);
      if (cycle?.status === "ACTIVE") {
        tradingCycleRepository.close(cycleId);
      }
    }

    const nextBtc = tradingCycleRepository.findActiveBySymbol("BTCUSDT");
    if (nextBtc) {
      tradingCycleRepository.close(nextBtc.id);
    }

    const nextEth = tradingCycleRepository.findActiveBySymbol("ETHUSDT");
    if (nextEth) {
      tradingCycleRepository.close(nextEth.id);
    }

    console.log("M13 TEST DATA: CLEANED");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
