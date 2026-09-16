import db from "../src/lib/database";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { positionRepository } from "../src/database/repositories/positionRepository";
import { createTradingConfigSnapshot } from "../src/config/trading";
import { TakeProfitService } from "../src/services/takeProfitService";

const symbol = "BTCUSDT";
const snapshot = createTradingConfigSnapshot(symbol);

const cleanup = () => {
  db.prepare("DELETE FROM fills WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ?)").run(symbol);
  db.prepare("DELETE FROM dca_levels WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ?)").run(symbol);
  db.prepare("DELETE FROM orders WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ?)").run(symbol);
  db.prepare("DELETE FROM positions WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ?)").run(symbol);
  db.prepare("DELETE FROM trading_cycles WHERE symbol = ?").run(symbol);
};

cleanup();

try {
  const cycleId = tradingCycleRepository.create({
    symbol,
    cycleNumber: 1,
    referencePrice: 100,
    configVersion: snapshot.configVersion,
    configSnapshotJson: JSON.stringify(snapshot),
  });

  positionRepository.create(cycleId, symbol);
  positionRepository.update(cycleId, 0.02, 97.5, 1.95);

  const service = new TakeProfitService();

  const first = service.calculate(cycleId);

  if (first.takeProfitPrice !== 99.45) {
    throw new Error(`Unexpected initial TP: ${first.takeProfitPrice}`);
  }

  positionRepository.update(cycleId, 0.03, 95, 2.85);

  const recalculated = service.calculate(cycleId);

  if (recalculated.takeProfitPrice !== 96.9) {
    throw new Error(`Unexpected recalculated TP: ${recalculated.takeProfitPrice}`);
  }

  if (recalculated.quantity !== 0.03) {
    throw new Error(`Unexpected position quantity: ${recalculated.quantity}`);
  }

  if (snapshot.takeProfitPercent !== 2) {
    throw new Error("Unexpected snapshot TP configuration.");
  }

  console.log("M11 TAKE PROFIT ENGINE: PASS");
  console.log({
    initialAveragePrice: first.averagePrice,
    initialTakeProfitPrice: first.takeProfitPrice,
    recalculatedAveragePrice: recalculated.averagePrice,
    recalculatedTakeProfitPrice: recalculated.takeProfitPrice,
    quantity: recalculated.quantity,
    configVersion: snapshot.configVersion,
  });
} finally {
  cleanup();
  db.close();
}
