import { mexcClient } from "./mexcClient";
import type { MexcSymbolInfo } from "./mexcMarketTypes";

export type MexcSymbolRules = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  baseAssetPrecision: number;
  quotePrecision: number;
  quoteAssetPrecision: number;
  baseSizePrecision: number;
  quoteAmountPrecision: number;
  quoteAmountPrecisionMarket: number | null;
  maxQuoteAmount: number | null;
  maxQuoteAmountMarket: number | null;
  orderTypes: string[];
  isSpotTradingAllowed: boolean;
  makerCommission: number | null;
  takerCommission: number | null;
};

function toPositiveNumber(
  value: string | number | undefined,
  fieldName: string,
): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid MEXC ${fieldName}: ${String(value)}`);
  }

  return parsed;
}

function toOptionalNonNegativeNumber(
  value: string | number | undefined,
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toOptionalPositiveNumber(
  value: string | number | undefined,
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeMexcSymbolRules(
  info: MexcSymbolInfo,
): MexcSymbolRules {
  if (!info.symbol) {
    throw new Error("MEXC symbol is missing");
  }

  if (!info.isSpotTradingAllowed) {
    throw new Error(`MEXC Spot trading is disabled for ${info.symbol}`);
  }

  return {
    symbol: info.symbol,
    status: info.status,
    baseAsset: info.baseAsset,
    quoteAsset: info.quoteAsset,
    baseAssetPrecision: info.baseAssetPrecision,
    quotePrecision: info.quotePrecision,
    quoteAssetPrecision: info.quoteAssetPrecision,
    baseSizePrecision: toPositiveNumber(
      info.baseSizePrecision,
      "baseSizePrecision",
    ),
    quoteAmountPrecision: toPositiveNumber(
      info.quoteAmountPrecision,
      "quoteAmountPrecision",
    ),
    quoteAmountPrecisionMarket: toOptionalPositiveNumber(
      info.quoteAmountPrecisionMarket,
    ),
    maxQuoteAmount: toOptionalPositiveNumber(info.maxQuoteAmount),
    maxQuoteAmountMarket: toOptionalPositiveNumber(
      info.maxQuoteAmountMarket,
    ),
    orderTypes: [...info.orderTypes],
    isSpotTradingAllowed: info.isSpotTradingAllowed,
    makerCommission: toOptionalNonNegativeNumber(info.makerCommission),
    takerCommission: toOptionalNonNegativeNumber(info.takerCommission),
  };
}

export class MexcSymbolRulesService {
  async getRules(symbol: string): Promise<MexcSymbolRules> {
    const response = await mexcClient.getExchangeInfo(symbol);

    const info = Array.isArray(response.symbols)
      ? response.symbols.find((item) => item.symbol === symbol)
      : response.symbols;

    if (!info || info.symbol !== symbol) {
      throw new Error(`MEXC symbol rules not found for ${symbol}`);
    }

    return normalizeMexcSymbolRules(info);
  }
}

export const mexcSymbolRulesService = new MexcSymbolRulesService();
