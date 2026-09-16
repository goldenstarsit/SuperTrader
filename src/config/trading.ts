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
