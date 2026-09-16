import { randomUUID } from "node:crypto";
import type { MexcClient } from "../exchange/mexcClient";
import type { MexcSymbolRules } from "../exchange/mexcSymbolRules";
import { dcaLevelRepository } from "../database/repositories/dcaLevelRepository";
import { orderRepository } from "../database/repositories/orderRepository";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import {
  calculateSnapshotDcaTargetPrice,
  type TradingConfigSnapshot,
} from "../config/trading";
import { calculateMinimumDcaBuyQuantity } from "../trading/dcaQuantityCalculator";

export class DcaEngineService {
  constructor(private readonly mexcClient: MexcClient) {}

  initializeLevels(cycleId: number): {
    created: number;
    levels: ReturnType<typeof dcaLevelRepository.findByCycleId>;
  } {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not ACTIVE.`);
    }

    const snapshot = JSON.parse(
      cycle.config_snapshot_json,
    ) as TradingConfigSnapshot;

    let created = 0;

    for (const dca of snapshot.dcaLevels) {
      const existing = dcaLevelRepository.findByCycleAndLevel(
        cycleId,
        dca.level,
      );

      if (existing) {
        continue;
      }

      dcaLevelRepository.create({
        cycleId,
        level: dca.level,
        dropPercent: dca.dropPercent,
        targetPrice: calculateSnapshotDcaTargetPrice(
          snapshot,
          cycle.reference_price,
          dca.level,
        ),
      });

      created += 1;
    }

    return {
      created,
      levels: dcaLevelRepository.findByCycleId(cycleId),
    };
  }

  async evaluate(
    cycleId: number,
    currentPrice: number,
    rules: MexcSymbolRules,
  ) {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error("Current price must be greater than zero.");
    }

    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not ACTIVE.`);
    }

    const initialized = this.initializeLevels(cycleId);

    const cycleOrders = orderRepository.findByCycleId(cycleId);

    const existingActiveDcaOrder = cycleOrders
      .filter(
        (order) =>
          order.order_type === "DCA" &&
          order.side === "BUY" &&
          order.dca_level !== null &&
          ["PENDING", "NEW", "PARTIALLY_FILLED"].includes(order.status),
      )
      .sort((a, b) => (a.dca_level ?? 0) - (b.dca_level ?? 0))[0];

    if (existingActiveDcaOrder) {
      const level = initialized.levels.find(
        (item) => item.level === existingActiveDcaOrder.dca_level,
      );

      if (level) {
        return [
          {
            level: level.level,
            action: "EXISTS",
            order: existingActiveDcaOrder,
          },
        ];
      }
    }

    const nextPendingLevel = initialized.levels
      .filter((level) => level.status === "PENDING")
      .sort((a, b) => a.level - b.level)[0];

    if (!nextPendingLevel) {
      return [];
    }

    if (currentPrice > nextPendingLevel.target_price) {
      return [
        {
          level: nextPendingLevel.level,
          action: "WAIT",
          targetPrice: nextPendingLevel.target_price,
        },
      ];
    }

    const quantity = calculateMinimumDcaBuyQuantity(
      nextPendingLevel.target_price,
      rules,
    );

    const existingOrder = orderRepository
      .findByCycleId(cycleId)
      .find(
        (order) =>
          order.order_type === "DCA" &&
          order.dca_level === nextPendingLevel.level,
      );

    if (existingOrder) {
      dcaLevelRepository.updateStatus(
        nextPendingLevel.id,
        "ORDERED",
        existingOrder.id,
      );

      return [
        {
          level: nextPendingLevel.level,
          action: "EXISTS",
          order: existingOrder,
        },
      ];
    }

    const clientOrderId =
      `st-dca-${cycleId}-${nextPendingLevel.level}-${randomUUID()
        .replaceAll("-", "")
        .slice(0, 16)}`;

    const localOrderId = orderRepository.create({
      cycleId,
      symbol: cycle.symbol,
      clientOrderId,
      orderType: "DCA",
      side: "BUY",
      executionType: "LIMIT_MAKER",
      dcaLevel: nextPendingLevel.level,
      requestedPrice: nextPendingLevel.target_price,
      requestedQuantity: quantity,
    });

    dcaLevelRepository.updateStatus(
      nextPendingLevel.id,
      "ORDERED",
      localOrderId,
    );

    return [
      {
        level: nextPendingLevel.level,
        action: "PREPARED",
        order: orderRepository.findById(localOrderId),
      },
    ];
  }

  async submitPreparedOrder(orderId: number) {
    const order = orderRepository.findById(orderId);

    if (!order) {
      throw new Error(`DCA order ${orderId} not found.`);
    }

    if (
      order.order_type !== "DCA" ||
      order.side !== "BUY" ||
      order.execution_type !== "LIMIT_MAKER"
    ) {
      throw new Error(`Order ${orderId} is not a DCA LIMIT_MAKER BUY.`);
    }

    if (order.exchange_order_id) {
      return {
        submitted: false,
        reason: "DCA_ORDER_ALREADY_SUBMITTED",
        order,
      };
    }

    if (
      order.requested_quantity === null ||
      order.requested_price === null
    ) {
      throw new Error(`DCA order ${orderId} is missing price or quantity.`);
    }

    const response = await this.mexcClient.placeLimitMakerBuy(
      order.symbol,
      order.requested_quantity,
      order.requested_price,
      order.client_order_id,
    );

    orderRepository.setExchangeOrderId(order.id, response.orderId);

    return {
      submitted: true,
      order: orderRepository.findById(order.id),
      exchangeOrderId: response.orderId,
    };
  }
}
