export type MexcOrderSide = "BUY" | "SELL";
export type MexcOrderType = "MARKET" | "LIMIT" | "LIMIT_MAKER";

export type MexcPlaceOrderResponse = {
  symbol: string;
  orderId: string;
  orderListId?: string | number;
  price?: string;
  origQty?: string;
  type: string;
  side: string;
  transactTime?: number;
};

export type MexcOrderResponse = {
  symbol: string;
  orderId: string;
  orderListId?: string | number;
  clientOrderId?: string;
  origClientOrderId?: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: string;
  timeInForce?: string;
  type: string;
  side: string;
  time?: number;
  updateTime?: number;
  isWorking?: boolean;
  origQuoteOrderQty?: string;
};

export type MexcMyTrade = {
  symbol: string;
  id: string;
  orderId: string;
  price: string;
  qty: string;
  quoteQty: string;
  commission: string;
  commissionAsset: string;
  time: number;
  isBuyerMaker: boolean;
  isBestMatch: boolean;
  isSelfTrade?: boolean;
  clientOrderId?: string | null;
};
