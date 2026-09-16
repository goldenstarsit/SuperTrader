import { mexcClient } from "../exchange/mexcClient";

export type MarketPrice = {
  symbol: string;
  bidPrice: number;
  bidQuantity: number;
  askPrice: number;
  askQuantity: number;
  price: number;
  receivedAt: number;
};

export const DEFAULT_MARKET_DATA_MAX_AGE_MS = 10_000;

export function isMarketPriceFresh(
  marketPrice: MarketPrice,
  now = Date.now(),
  maxAgeMs = DEFAULT_MARKET_DATA_MAX_AGE_MS,
): boolean {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return false;
  }

  if (!Number.isFinite(marketPrice.receivedAt)) {
    return false;
  }

  const age = now - marketPrice.receivedAt;

  return age >= 0 && age <= maxAgeMs;
}

export function assertFreshMarketPrice(
  marketPrice: MarketPrice,
  now = Date.now(),
  maxAgeMs = DEFAULT_MARKET_DATA_MAX_AGE_MS,
): void {
  if (!isMarketPriceFresh(marketPrice, now, maxAgeMs)) {
    throw new Error(
      `Stale market data for ${marketPrice.symbol}: receivedAt=${marketPrice.receivedAt}, now=${now}, maxAgeMs=${maxAgeMs}`,
    );
  }
}

function parsePositive(value: string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: ${value}`);
  }

  return parsed;
}

export class MarketPriceService {
  async getPrice(symbol: string): Promise<MarketPrice> {
    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      throw new Error("Symbol is required");
    }

    const ticker = await mexcClient.getBookTicker(normalizedSymbol);

    const bidPrice = parsePositive(ticker.bidPrice, "bid price");
    const bidQuantity = parsePositive(ticker.bidQty, "bid quantity");
    const askPrice = parsePositive(ticker.askPrice, "ask price");
    const askQuantity = parsePositive(ticker.askQty, "ask quantity");

    if (ticker.symbol !== normalizedSymbol) {
      throw new Error(
        `MEXC ticker symbol mismatch: expected ${normalizedSymbol}, received ${ticker.symbol}`,
      );
    }

    if (bidPrice > askPrice) {
      throw new Error(
        `Invalid market data for ${normalizedSymbol}: bid exceeds ask`,
      );
    }

    return {
      symbol: normalizedSymbol,
      bidPrice,
      bidQuantity,
      askPrice,
      askQuantity,
      price: (bidPrice + askPrice) / 2,
      receivedAt: Date.now(),
    };
  }
}

export const marketPriceService = new MarketPriceService();
