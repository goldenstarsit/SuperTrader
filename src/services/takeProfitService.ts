import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import { positionRepository } from "../database/repositories/positionRepository";
import { calculateSnapshotTakeProfitPrice, type TradingConfigSnapshot } from "../config/trading";

export type TakeProfitSnapshot = {
  cycleId: number;
  symbol: string;
  averagePrice: number;
  quantity: number;
  takeProfitPrice: number;
};

export class TakeProfitService {
  calculate(cycleId: number): TakeProfitSnapshot {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not active.`);
    }

    const position = positionRepository.findByCycleId(cycleId);

    if (!position || position.quantity <= 0 || position.average_price === null) {
      throw new Error(
        `Cycle ${cycleId} does not have an open position with an average price.`,
      );
    }

    let snapshot: TradingConfigSnapshot;

    try {
      snapshot = JSON.parse(cycle.config_snapshot_json) as TradingConfigSnapshot;
    } catch {
      throw new Error(`Invalid configuration snapshot for cycle ${cycleId}.`);
    }

    const takeProfitPrice = calculateSnapshotTakeProfitPrice(
      snapshot,
      position.average_price,
    );

    return {
      cycleId,
      symbol: cycle.symbol,
      averagePrice: position.average_price,
      quantity: position.quantity,
      takeProfitPrice,
    };
  }
}
