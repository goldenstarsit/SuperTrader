import { fillRepository } from "../database/repositories/fillRepository";
import { orderRepository } from "../database/repositories/orderRepository";
import { positionRepository } from "../database/repositories/positionRepository";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";

export type PositionSnapshot = {
  cycleId: number;
  symbol: string;
  quantity: number;
  averagePrice: number | null;
  investedAmount: number;
};

export class PositionService {
  rebuild(cycleId: number): PositionSnapshot {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    const fills = fillRepository.findByCycleId(cycleId);

    let quantity = 0;
    let investedAmount = 0;

    for (const fill of fills) {
      const order = orderRepository.findById(fill.order_id);

      if (!order) {
        throw new Error(
          `Order ${fill.order_id} for fill ${fill.id} was not found.`,
        );
      }

      if (order.cycle_id !== cycleId) {
        throw new Error(
          `Fill ${fill.id} references an order from another cycle.`,
        );
      }

      if (order.symbol !== cycle.symbol || fill.symbol !== cycle.symbol) {
        throw new Error(
          `Fill ${fill.id} does not belong to cycle symbol ${cycle.symbol}.`,
        );
      }

      if (order.side !== "BUY") {
        continue;
      }

      if (
        !Number.isFinite(fill.quantity) ||
        fill.quantity <= 0 ||
        !Number.isFinite(fill.price) ||
        fill.price <= 0
      ) {
        throw new Error(`Invalid BUY fill ${fill.id}.`);
      }

      quantity += fill.quantity;
      investedAmount += fill.quantity * fill.price;
    }

    const averagePrice =
      quantity > 0 ? investedAmount / quantity : null;

    const existing = positionRepository.findByCycleId(cycleId);

    if (!existing) {
      positionRepository.create(cycleId, cycle.symbol);
    }

    positionRepository.update(
      cycleId,
      quantity,
      averagePrice,
      investedAmount,
    );

    return {
      cycleId,
      symbol: cycle.symbol,
      quantity,
      averagePrice,
      investedAmount,
    };
  }

  get(cycleId: number): PositionSnapshot {
    const position = positionRepository.findByCycleId(cycleId);

    if (!position) {
      throw new Error(`Position for cycle ${cycleId} not found.`);
    }

    return {
      cycleId: position.cycle_id,
      symbol: position.symbol,
      quantity: position.quantity,
      averagePrice: position.average_price,
      investedAmount: position.invested_amount,
    };
  }
}
