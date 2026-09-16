import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import { calculateSnapshotStopLossPrice, type TradingConfigSnapshot } from "../config/trading";

export type StopLossSnapshot = {
  cycleId: number;
  symbol: string;
  referencePrice: number;
  stopLossPrice: number;
  stopLossPercent: number;
};

export class StopLossService {
  calculate(cycleId: number): StopLossSnapshot {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not active.`);
    }

    let snapshot: TradingConfigSnapshot;

    try {
      snapshot = JSON.parse(cycle.config_snapshot_json) as TradingConfigSnapshot;
    } catch {
      throw new Error(`Invalid configuration snapshot for cycle ${cycleId}.`);
    }

    if (snapshot.symbol !== cycle.symbol) {
      throw new Error(
        `Configuration snapshot symbol does not match cycle symbol ${cycle.symbol}.`,
      );
    }

    const stopLossPrice = calculateSnapshotStopLossPrice(
      snapshot,
      cycle.reference_price,
    );

    return {
      cycleId,
      symbol: cycle.symbol,
      referencePrice: cycle.reference_price,
      stopLossPrice,
      stopLossPercent: snapshot.stopLossPercent,
    };
  }
}
