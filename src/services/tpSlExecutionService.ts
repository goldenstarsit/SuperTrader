import { randomUUID } from "node:crypto";
import { mexcAccountService } from "../exchange/mexcAccountService";
import { mexcClient } from "../exchange/mexcClient";
import { mexcSymbolRulesService } from "../exchange/mexcSymbolRules";
import { orderRepository } from "../database/repositories/orderRepository";
import { fillRepository } from "../database/repositories/fillRepository";
import { positionRepository } from "../database/repositories/positionRepository";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import { calculateMaximumSellQuantity } from "../trading/sellQuantityCalculator";
import { PositionService } from "./positionService";
import { cycleLifecycleService } from "./cycleLifecycleService";
import { marketPriceService } from "../market/marketPriceService";

export type CloseTrigger = "TAKE_PROFIT" | "STOP_LOSS";

export type PreparedCloseOrder = {
  orderId: number;
  cycleId: number;
  symbol: string;
  trigger: CloseTrigger;
  quantity: number;
  availableBalance: number;
};

export class TpSlExecutionService {
  private readonly positionService = new PositionService();

  async prepareCloseOrder(
    cycleId: number,
    trigger: CloseTrigger,
  ): Promise<PreparedCloseOrder> {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not active.`);
    }

    const position = positionRepository.findByCycleId(cycleId);

    if (!position || position.quantity <= 0) {
      throw new Error(`No open position exists for cycle ${cycleId}.`);
    }

    const rules = await mexcSymbolRulesService.getRules(cycle.symbol);
    const availableBalance = await mexcAccountService.getFreeBalance(
      rules.baseAsset,
    );

    const quantityResult = calculateMaximumSellQuantity(
      position.quantity,
      availableBalance.free,
      rules,
    );

    if (quantityResult.quantity <= 0) {
      throw new Error(
        `No valid SELL quantity is available for ${cycle.symbol}.`,
      );
    }

    const clientOrderId =
      `st-${cycleId}-${trigger.toLowerCase()}-${randomUUID()}`;

    const orderId = orderRepository.create({
      cycleId,
      symbol: cycle.symbol,
      clientOrderId,
      orderType: trigger,
      side: "SELL",
      executionType: "MARKET",
      requestedQuantity: quantityResult.quantity,
    });

    return {
      orderId,
      cycleId,
      symbol: cycle.symbol,
      trigger,
      quantity: quantityResult.quantity,
      availableBalance: availableBalance.free,
    };
  }

  async submitCloseOrder(orderId: number): Promise<{
    orderId: number;
    exchangeOrderId: string;
  }> {
    const order = orderRepository.findById(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (order.side !== "SELL") {
      throw new Error(`Order ${orderId} is not a SELL order.`);
    }

    if (order.execution_type !== "MARKET") {
      throw new Error(`Order ${orderId} is not a MARKET order.`);
    }

    if (!order.requested_quantity || order.requested_quantity <= 0) {
      throw new Error(`Order ${orderId} has no valid SELL quantity.`);
    }

    if (order.exchange_order_id) {
      return {
        orderId: order.id,
        exchangeOrderId: order.exchange_order_id,
      };
    }

    const response = await mexcClient.placeMarketSell(
      order.symbol,
      order.requested_quantity,
      order.client_order_id,
    );

    orderRepository.setExchangeOrderId(order.id, response.orderId);
    orderRepository.updateStatus(order.id, "NEW");

    return {
      orderId: order.id,
      exchangeOrderId: response.orderId,
    };
  }

  async syncCloseOrder(orderId: number) {
    const localOrder = orderRepository.findById(orderId);

    if (!localOrder) {
      throw new Error(`Local order ${orderId} not found.`);
    }

    if (
      localOrder.side !== "SELL" ||
      (localOrder.order_type !== "TAKE_PROFIT" &&
        localOrder.order_type !== "STOP_LOSS")
    ) {
      throw new Error(`Order ${orderId} is not a TP/SL SELL order.`);
    }

    if (!localOrder.exchange_order_id) {
      throw new Error(`Order ${orderId} has no exchange order ID.`);
    }

    const exchangeOrder = await mexcClient.getOrder(
      localOrder.symbol,
      localOrder.exchange_order_id,
    );

    const trades = await mexcClient.getMyTrades(
      localOrder.symbol,
      localOrder.exchange_order_id,
    );

    let executedQuantity = 0;
    let totalQuoteValue = 0;

    for (const trade of trades) {
      const quantity = Number(trade.qty);
      const price = Number(trade.price);

      if (
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(price) ||
        price <= 0
      ) {
        throw new Error(`Invalid SELL fill data for trade ${trade.id}.`);
      }

      executedQuantity += quantity;
      totalQuoteValue += quantity * price;
    }

    const exchangeExecutedQuantity = Number(exchangeOrder.executedQty);

    if (
      !Number.isFinite(exchangeExecutedQuantity) ||
      exchangeExecutedQuantity < 0
    ) {
      throw new Error(`Invalid executed quantity for order ${orderId}.`);
    }

    if (
      trades.length > 0 &&
      executedQuantity > exchangeExecutedQuantity + 1e-12
    ) {
      throw new Error(
        `Trade quantity exceeds exchange executed quantity for order ${orderId}.`,
      );
    }

    const effectiveExecutedQuantity =
      trades.length > 0 ? executedQuantity : exchangeExecutedQuantity;

    const averageFillPrice =
      effectiveExecutedQuantity > 0
        ? trades.length > 0
          ? totalQuoteValue / effectiveExecutedQuantity
          : Number(exchangeOrder.cummulativeQuoteQty) /
            effectiveExecutedQuantity
        : null;

    const statusMap: Record<
      string,
      Parameters<typeof orderRepository.updateStatus>[1]
    > = {
      NEW: "NEW",
      PARTIALLY_FILLED: "PARTIALLY_FILLED",
      FILLED: "FILLED",
      CANCELED: "CANCELED",
      REJECTED: "REJECTED",
      EXPIRED: "EXPIRED",
    };

    const status = statusMap[exchangeOrder.status];

    if (!status) {
      throw new Error(
        `Unsupported exchange order status: ${exchangeOrder.status}`,
      );
    }

    orderRepository.updateStatus(
      orderId,
      status,
      effectiveExecutedQuantity,
      averageFillPrice ?? undefined,
    );

    for (const trade of trades) {
      const quantity = Number(trade.qty);
      const price = Number(trade.price);
      const fee = Number(trade.commission);

      if (!Number.isFinite(fee) || fee < 0) {
        throw new Error(`Invalid fee for trade ${trade.id}.`);
      }

      if (!fillRepository.findByExchangeTradeId(trade.id)) {
        fillRepository.create({
          orderId,
          cycleId: localOrder.cycle_id,
          symbol: localOrder.symbol,
          exchangeTradeId: trade.id,
          quantity,
          price,
          fee,
          feeAsset: trade.commissionAsset,
          filledAt: new Date(trade.time).toISOString(),
        });
      }
    }

    return {
      order: orderRepository.findById(orderId),
      fills: fillRepository.findByOrderId(orderId),
      executedQuantity: effectiveExecutedQuantity,
      averageFillPrice,
    };
  }

  async closeCycleAfterFilledSell(orderId: number): Promise<{
    closedCycleId: number;
    closedSymbol: string;
    closedCycleNumber: number;
    nextCycleId: number;
    nextCycleNumber: number;
  }> {
    const order = orderRepository.findById(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found.`);
    }

    if (
      order.side !== "SELL" ||
      (order.order_type !== "TAKE_PROFIT" &&
        order.order_type !== "STOP_LOSS")
    ) {
      throw new Error(`Order ${orderId} is not a TP/SL SELL order.`);
    }

    if (order.status !== "FILLED") {
      throw new Error(`Close order ${orderId} is not FILLED.`);
    }

    const cycle = tradingCycleRepository.findById(order.cycle_id);

    if (!cycle) {
      throw new Error(`Trading cycle ${order.cycle_id} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycle.id} is not active.`);
    }

    const position = positionRepository.findByCycleId(cycle.id);

    if (!position || position.quantity <= 0) {
      throw new Error(`No open position exists for cycle ${cycle.id}.`);
    }

    const executedQuantity = order.executed_quantity ?? 0;

    if (executedQuantity + 1e-12 < position.quantity) {
      throw new Error(
        `SELL order ${orderId} did not fully close cycle ${cycle.id}.`,
      );
    }

    this.positionService.close(cycle.id);
    tradingCycleRepository.close(cycle.id);

    const currentPrice = await marketPriceService.getPrice(cycle.symbol);
    const nextCycle = cycleLifecycleService.ensureActiveCycle(currentPrice);

    if (nextCycle.cycleNumber !== cycle.cycle_number + 1) {
      throw new Error(
        `Unexpected next cycle number for ${cycle.symbol}: ${nextCycle.cycleNumber}.`,
      );
    }

    return {
      closedCycleId: cycle.id,
      closedSymbol: cycle.symbol,
      closedCycleNumber: cycle.cycle_number,
      nextCycleId: nextCycle.cycleId,
      nextCycleNumber: nextCycle.cycleNumber,
    };
  }
}

export const tpSlExecutionService = new TpSlExecutionService();
