export type DcaQuantityRules = {
  baseSizePrecision: number;
};

const MIN_REQUIRED_QUOTE_AMOUNT = 1;

function floorToStep(value: number, step: number): number {
  const precision = Math.max(0, Math.ceil(-Math.log10(step)) + 2);
  return Number((Math.floor(value / step + 1e-12) * step).toFixed(precision));
}

export function calculateMinimumDcaBuyQuantity(
  targetPrice: number,
  rules: DcaQuantityRules,
): number {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error("DCA target price must be greater than zero.");
  }

  const step = rules.baseSizePrecision;

  if (!Number.isFinite(step) || step <= 0) {
    throw new Error("A valid baseSizePrecision is required for DCA BUY.");
  }

  let quantity = floorToStep(2 / targetPrice, step);

  if (quantity <= 0 || quantity * targetPrice <= MIN_REQUIRED_QUOTE_AMOUNT) {
    quantity = floorToStep(quantity + step, step);
  }

  if (quantity <= 0 || quantity * targetPrice <= MIN_REQUIRED_QUOTE_AMOUNT) {
    throw new Error(
      `Cannot calculate a DCA quantity greater than 1 USDT at target price ${targetPrice}.`,
    );
  }

  return quantity;
}
