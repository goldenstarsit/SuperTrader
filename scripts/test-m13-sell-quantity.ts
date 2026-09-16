import assert from "node:assert/strict";
import {
  calculateMaximumSellQuantity,
} from "../src/trading/sellQuantityCalculator";
import type { MexcSymbolRules } from "../src/exchange/mexcSymbolRules";

const rules = {
  symbol: "BTCUSDT",
  status: "1",
  baseAsset: "BTC",
  quoteAsset: "USDT",
  baseAssetPrecision: 8,
  quotePrecision: 8,
  quoteAssetPrecision: 8,
  baseSizePrecision: 0.000001,
  quoteAmountPrecision: 0.000001,
  quoteAmountPrecisionMarket: 1,
  maxQuoteAmount: 4000000,
  maxQuoteAmountMarket: 4000000,
  orderTypes: ["MARKET"],
  isSpotTradingAllowed: true,
  makerCommission: 0,
  takerCommission: 0,
} satisfies MexcSymbolRules;

const result = calculateMaximumSellQuantity(
  0.01234567,
  0.01234512,
  rules,
);

assert.equal(result.quantity, 0.012345);

const positionLimited = calculateMaximumSellQuantity(
  0.012,
  0.02,
  rules,
);

assert.equal(positionLimited.quantity, 0.012);

const balanceLimited = calculateMaximumSellQuantity(
  0.02,
  0.01234512,
  rules,
);

assert.equal(balanceLimited.quantity, 0.012345);

console.log("M13 SELL QUANTITY CALCULATOR: PASS");
console.log(result);
