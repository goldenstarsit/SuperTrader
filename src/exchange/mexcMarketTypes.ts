export type MexcSymbolInfo = {
  symbol: string;
  status: string;
  baseAsset: string;
  baseAssetPrecision: number;
  quoteAsset: string;
  quotePrecision: number;
  quoteAssetPrecision: number;
  baseCommissionPrecision: number;
  quoteCommissionPrecision: number;
  orderTypes: string[];
  quoteOrderQtyMarketAllowed: boolean;
  isSpotTradingAllowed: boolean;
  isMarginTradingAllowed: boolean;
  quoteAmountPrecision?: string;
  quoteAmountPrecisionMarket?: string;
  baseSizePrecision?: string;
  permissions: string[];
  maxQuoteAmount?: string;
  maxQuoteAmountMarket?: string;
  makerCommission?: string;
  takerCommission?: string;
  tradeSideType?: string;
  filters: unknown[];
};

export type MexcExchangeInfoResponse = {
  timezone: string;
  serverTime: number;
  rateLimits: unknown[];
  exchangeFilters: unknown[];
  symbols: MexcSymbolInfo[] | MexcSymbolInfo;
};

export type MexcBookTicker = {
  symbol: string;
  bidPrice: string;
  bidQty: string;
  askPrice: string;
  askQty: string;
};
