import type { MexcClient } from "../exchange/mexcClient";
import { orderRepository } from "../database/repositories/orderRepository";
import { fillRepository } from "../database/repositories/fillRepository";

export class InitialMarketBuyFillService {
  constructor(private readonly mexcClient: MexcClient) {}

  async sync(orderId: number) {
    const localOrder = orderRepository.findById(orderId);

    if (!localOrder) {
      throw new Error(`Local order ${orderId} not found.`);
    }

    if (localOrder.order_type !== "INITIAL" || localOrder.side !== "BUY") {
      throw new Error(`Order ${orderId} is not an Initial BUY order.`);
    }

    if (!localOrder.exchange_order_id) {
      throw new Error(`Order ${orderId} has no exchange order ID.`);
    }

    const exchangeOrder = await this.mexcClient.getOrder(
      localOrder.symbol,
      localOrder.exchange_order_id,
    );

    const trades = await this.mexcClient.getMyTrades(
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
        throw new Error(`Invalid fill data for trade ${trade.id}.`);
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

    if (trades.length > 0 && executedQuantity > exchangeExecutedQuantity + 1e-12) {
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

    const statusMap: Record<string, Parameters<typeof orderRepository.updateStatus>[1]> = {
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
}
