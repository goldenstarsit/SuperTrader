import type {
  CycleStatus,
  DcaLevelStatus,
  ExecutionType,
  OrderSide,
  OrderStatus,
  OrderType,
  PositionStatus,
} from "./states";

export type TradingCycleEntity = {
  id: number;
  symbol: string;
  cycleNumber: number;
  status: CycleStatus;
  referencePrice: number;
  configVersion: string;
  configSnapshotJson: string;
  createdAt: string;
  closedAt: string | null;
};

export type TradingOrderEntity = {
  id: number;
  cycleId: number;
  symbol: string;
  clientOrderId: string;
  exchangeOrderId: string | null;
  orderType: OrderType;
  side: OrderSide;
  executionType: ExecutionType;
  dcaLevel: number | null;
  requestedPrice: number | null;
  requestedQuantity: number | null;
  executedQuantity: number;
  averageFillPrice: number | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
};

export type TradingFillEntity = {
  id: number;
  orderId: number;
  cycleId: number;
  symbol: string;
  exchangeTradeId: string;
  quantity: number;
  price: number;
  fee: number;
  feeAsset: string | null;
  filledAt: string;
};

export type TradingPositionEntity = {
  id: number;
  cycleId: number;
  symbol: string;
  status: PositionStatus;
  quantity: number;
  averagePrice: number | null;
  investedAmount: number;
  updatedAt: string;
};

export type DcaLevelEntity = {
  id: number;
  cycleId: number;
  level: number;
  dropPercent: number;
  targetPrice: number;
  status: DcaLevelStatus;
  orderId: number | null;
  createdAt: string;
  updatedAt: string;
};
