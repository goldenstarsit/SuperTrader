export const tradingConfig = {
  symbols: ["BTCUSDT"],

  dcaLevels: [
    { level: 1, dropPercent: 1 },
    { level: 2, dropPercent: 3 },
    { level: 3, dropPercent: 6 },
    { level: 4, dropPercent: 10 },
    { level: 5, dropPercent: 15 },
    { level: 6, dropPercent: 21 },
    { level: 7, dropPercent: 28 },
    { level: 8, dropPercent: 36 },
    { level: 9, dropPercent: 45 },
  ],

  takeProfitPercent: 2,
  stopLossPercent: 50,
} as const;

function validateTradingConfig(): void {
  if (tradingConfig.symbols.length < 1) {
    throw new Error("At least one trading symbol is required");
  }

  for (const symbol of tradingConfig.symbols) {
    if (!/^[A-Z0-9]+$/.test(symbol)) {
      throw new Error(`Invalid trading symbol: ${symbol}`);
    }
  }

  if (tradingConfig.dcaLevels.length !== 9) {
    throw new Error("Exactly 9 DCA levels are required");
  }

  for (let i = 0; i < tradingConfig.dcaLevels.length; i++) {
    const dca = tradingConfig.dcaLevels[i];

    if (dca.level !== i + 1) {
      throw new Error(`Invalid DCA level numbering: ${dca.level}`);
    }

    if (dca.dropPercent <= 0 || dca.dropPercent >= 100) {
      throw new Error(`Invalid DCA${dca.level} percentage: ${dca.dropPercent}%`);
    }

    if (i > 0 && dca.dropPercent <= tradingConfig.dcaLevels[i - 1].dropPercent) {
      throw new Error(`DCA${dca.level} must be greater than the previous DCA level`);
    }
  }

  if (
    tradingConfig.takeProfitPercent <= 0 ||
    tradingConfig.takeProfitPercent >= 100
  ) {
    throw new Error(
      `Invalid take-profit percentage: ${tradingConfig.takeProfitPercent}%`,
    );
  }

  if (
    tradingConfig.stopLossPercent <= 0 ||
    tradingConfig.stopLossPercent >= 100
  ) {
    throw new Error(
      `Invalid stop-loss percentage: ${tradingConfig.stopLossPercent}%`,
    );
  }
}

validateTradingConfig();

export type TradingConfig = typeof tradingConfig;

export function getTradingConfig(symbol: string): TradingConfig {
  if (!tradingConfig.symbols.includes(symbol as (typeof tradingConfig.symbols)[number])) {
    throw new Error(`No trading configuration found for symbol: ${symbol}`);
  }

  return tradingConfig;
}

export function getDcaDropPercent(symbol: string, level: number): number {
  const config = getTradingConfig(symbol);
  const dca = config.dcaLevels.find((item) => item.level === level);

  if (!dca) {
    throw new Error(`DCA level ${level} is not configured for ${symbol}`);
  }

  return dca.dropPercent;
}

export function calculateDcaTargetPrice(
  symbol: string,
  referencePrice: number,
  level: number,
): number {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error("Reference price must be greater than zero");
  }

  const dropPercent = getDcaDropPercent(symbol, level);

  return referencePrice * (1 - dropPercent / 100);
}

export function calculateTakeProfitPrice(
  symbol: string,
  averagePrice: number,
): number {
  if (!Number.isFinite(averagePrice) || averagePrice <= 0) {
    throw new Error("Average price must be greater than zero");
  }

  const config = getTradingConfig(symbol);

  return averagePrice * (1 + config.takeProfitPercent / 100);
}

export function calculateStopLossPrice(
  symbol: string,
  referencePrice: number,
): number {
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new Error("Stop-loss reference price must be greater than zero");
  }

  const config = getTradingConfig(symbol);

  return referencePrice * (1 - config.stopLossPercent / 100);
}
