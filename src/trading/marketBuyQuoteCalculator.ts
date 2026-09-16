export type MarketBuyQuoteRules = {
  quoteAmountPrecisionMarket: number | null;
  maxQuoteAmountMarket: number | null;
};

const MIN_REQUIRED_QUOTE_AMOUNT = 1;

export function calculateMinimumMarketBuyQuoteAmount(
  rules: MarketBuyQuoteRules,
): number {
  const step = rules.quoteAmountPrecisionMarket;

  if (!Number.isFinite(step) || step === null || step <= 0) {
    throw new Error(
      "A valid quoteAmountPrecisionMarket is required for Market BUY.",
    );
  }

  if (
    rules.maxQuoteAmountMarket !== null &&
    (!Number.isFinite(rules.maxQuoteAmountMarket) ||
      rules.maxQuoteAmountMarket <= MIN_REQUIRED_QUOTE_AMOUNT)
  ) {
    throw new Error(
      "MEXC maxQuoteAmountMarket does not allow a quote amount greater than 1 USDT.",
    );
  }

  const minimumSteps =
    Math.floor(MIN_REQUIRED_QUOTE_AMOUNT / step) + 1;

  const quoteAmount = minimumSteps * step;

  if (
    rules.maxQuoteAmountMarket !== null &&
    quoteAmount > rules.maxQuoteAmountMarket
  ) {
    throw new Error("Calculated Market BUY quote amount exceeds MEXC maximum.");
  }

  return Number(quoteAmount.toFixed(12));
}
