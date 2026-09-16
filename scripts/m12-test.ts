import db from "../src/lib/database";
import { tradingCycleRepository } from "../src/database/repositories/tradingCycleRepository";
import { createTradingConfigSnapshot } from "../src/config/trading";
import { StopLossService } from "../src/services/stopLossService";

const symbol = "BTCUSDT";
const snapshot = createTradingConfigSnapshot(symbol);

const cleanup = () => {
  db.prepare("DELETE FROM fills WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ? AND cycle_number = 999)").run(symbol);
  db.prepare("DELETE FROM dca_levels WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ? AND cycle_number = 999)").run(symbol);
  db.prepare("DELETE FROM orders WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ? AND cycle_number = 999)").run(symbol);
  db.prepare("DELETE FROM positions WHERE cycle_id IN (SELECT id FROM trading_cycles WHERE symbol = ? AND cycle_number = 999)").run(symbol);
  db.prepare("DELETE FROM trading_cycles WHERE symbol = ? AND cycle_number = 999").run(symbol);
};

cleanup();

try {
  const cycleId = tradingCycleRepository.create({
    symbol,
    cycleNumber: 999,
    referencePrice: 100,
    configVersion: snapshot.configVersion,
    configSnapshotJson: JSON.stringify(snapshot),
  });

  const service = new StopLossService();

  const initial = service.calculate(cycleId);

  if (initial.stopLossPrice !== 50) {
    throw new Error(`Unexpected initial SL: ${initial.stopLossPrice}`);
  }

  const afterDca = service.calculate(cycleId);

  if (afterDca.stopLossPrice !== initial.stopLossPrice) {
    throw new Error(
      `Stop-loss changed during the active cycle: ${afterDca.stopLossPrice}`,
    );
  }

  if (afterDca.referencePrice !== initial.referencePrice) {
    throw new Error("Cycle reference price unexpectedly changed.");
  }

  const originalSnapshot = JSON.parse(
    tradingCycleRepository.findById(cycleId)!.config_snapshot_json,
  ) as typeof snapshot;

  if (originalSnapshot.stopLossPercent !== 50) {
    throw new Error("Cycle configuration snapshot was unexpectedly changed.");
  }

  console.log("M12 STOP LOSS ENGINE: PASS");
  console.log({
    initialReferencePrice: initial.referencePrice,
    initialStopLossPrice: initial.stopLossPrice,
    afterDcaReferencePrice: afterDca.referencePrice,
    afterDcaStopLossPrice: afterDca.stopLossPrice,
    stopLossPercent: afterDca.stopLossPercent,
    configVersion: originalSnapshot.configVersion,
  });
} finally {
  cleanup();
  db.close();
}
