import {
  marketPriceService,
  type MarketPrice,
} from "./marketPriceService";

export type MarketPriceListener = (price: MarketPrice) => void;

export class MarketPricePollingService {
  private readonly prices = new Map<string, MarketPrice>();
  private readonly listeners = new Set<MarketPriceListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly intervalMs = 1_000,
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
      throw new Error("Market price polling interval must be a positive integer");
    }
  }

  subscribe(listener: MarketPriceListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  getLatest(symbol: string): MarketPrice | null {
    return this.prices.get(symbol.trim().toUpperCase()) ?? null;
  }

  getLatestAll(): MarketPrice[] {
    return [...this.prices.values()];
  }

  async poll(symbols: readonly string[]): Promise<MarketPrice[]> {
    const normalizedSymbols = [
      ...new Set(
        symbols
          .map((symbol) => symbol.trim().toUpperCase())
          .filter((symbol) => symbol.length > 0),
      ),
    ];

    const results = await Promise.allSettled(
      normalizedSymbols.map((symbol) => marketPriceService.getPrice(symbol)),
    );

    const successful: MarketPrice[] = [];

    for (const result of results) {
      if (result.status !== "fulfilled") {
        continue;
      }

      this.prices.set(result.value.symbol, result.value);
      successful.push(result.value);

      for (const listener of this.listeners) {
        listener(result.value);
      }
    }

    return successful;
  }

  start(symbols: readonly string[]): void {
    if (this.running) {
      return;
    }

    this.running = true;

    void this.poll(symbols);

    this.timer = setInterval(() => {
      void this.poll(symbols);
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const marketPricePollingService = new MarketPricePollingService();
