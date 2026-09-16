export const cycleStatuses = ["ACTIVE", "CLOSED"] as const;
export type CycleStatus = (typeof cycleStatuses)[number];

export const orderStatuses = [
  "PENDING",
  "NEW",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELED",
  "REJECTED",
  "EXPIRED",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const orderTypes = [
  "INITIAL",
  "DCA",
  "TAKE_PROFIT",
  "STOP_LOSS",
] as const;
export type OrderType = (typeof orderTypes)[number];

export const orderSides = ["BUY", "SELL"] as const;
export type OrderSide = (typeof orderSides)[number];

export const executionTypes = ["MARKET", "LIMIT_MAKER"] as const;
export type ExecutionType = (typeof executionTypes)[number];

export const dcaLevelStatuses = [
  "PENDING",
  "ORDERED",
  "FILLED",
  "SKIPPED",
] as const;
export type DcaLevelStatus = (typeof dcaLevelStatuses)[number];

export const positionStatuses = ["EMPTY", "OPEN", "CLOSED"] as const;
export type PositionStatus = (typeof positionStatuses)[number];
