import type { MexcSymbolRules } from "../exchange/mexcSymbolRules";

const EPSILON = 1e-12;

export type SellQuantityResult = {
  positionQuantity: number;
  availableBalance: number;
  quantity: number;
};

function floorToStep(value: number, step: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("baseSizePrecision must be greater than zero.");
  }

  const units = Math.floor((value + EPSILON) / step);
  return units * step;
}

export function calculateMaximumSellQuantity(
  positionQuantity: number,
  availableBalance: number,
  rules: MexcSymbolRules,
): SellQuantityResult {
  if (!Number.isFinite(positionQuantity) || positionQuantity < 0) {
    throw new Error("positionQuantity must be zero or greater.");
  }

  if (!Number.isFinite(availableBalance) || availableBalance < 0) {
    throw new Error("availableBalance must be zero or greater.");
  }

  const maximumAvailable = Math.min(positionQuantity, availableBalance);

  const quantity = floorToStep(
    maximumAvailable,
    rules.baseSizePrecision,
  );

  return {
    positionQuantity,
    availableBalance,
    quantity,
  };
}
