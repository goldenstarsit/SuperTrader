import {
  createTradingConfigSnapshot,
  tradingConfigVersion,
} from "../config/trading";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import db from "../lib/database";
import type { MarketPrice } from "../market/marketPriceService";

export type CycleLifecycleResult = {
  cycleId: number;
  symbol: string;
  cycleNumber: number;
  referencePrice: number;
  created: boolean;
};

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();

  if (!normalized) {
    throw new Error("Symbol is required");
  }

  return normalized;
}

function validateMarketPrice(price: MarketPrice): void {
  if (!Number.isFinite(price.price) || price.price <= 0) {
    throw new Error(`Invalid market price for ${price.symbol}`);
  }

  if (!Number.isFinite(price.bidPrice) || price.bidPrice <= 0) {
    throw new Error(`Invalid bid price for ${price.symbol}`);
  }

  if (!Number.isFinite(price.askPrice) || price.askPrice <= 0) {
    throw new Error(`Invalid ask price for ${price.symbol}`);
  }

  if (price.bidPrice > price.askPrice) {
    throw new Error(`Invalid bid/ask spread for ${price.symbol}`);
  }
}

export class CycleLifecycleService {
  ensureActiveCycle(price: MarketPrice): CycleLifecycleResult {
    validateMarketPrice(price);

    const symbol = normalizeSymbol(price.symbol);

    const createOrGetCycle = db.transaction(() => {
      const existingCycle =
        tradingCycleRepository.findActiveBySymbol(symbol);

      if (existingCycle) {
        return {
          cycleId: existingCycle.id,
          symbol: existingCycle.symbol,
          cycleNumber: existingCycle.cycle_number,
          referencePrice: existingCycle.reference_price,
          created: false,
        };
      }

      const snapshot = createTradingConfigSnapshot(symbol);
      const cycleNumber =
        tradingCycleRepository.getNextCycleNumber(symbol);

      const cycleId = tradingCycleRepository.create({
        symbol,
        cycleNumber,
        referencePrice: price.price,
        configVersion: tradingConfigVersion,
        configSnapshotJson: JSON.stringify(snapshot),
      });

      return {
        cycleId,
        symbol,
        cycleNumber,
        referencePrice: price.price,
        created: true,
      };
    });

    return createOrGetCycle.immediate();
  }
}

export const cycleLifecycleService = new CycleLifecycleService();
