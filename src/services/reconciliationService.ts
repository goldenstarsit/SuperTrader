import db from "../lib/database";
import { fillRepository } from "../database/repositories/fillRepository";
import { orderRepository } from "../database/repositories/orderRepository";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import { mexcClient } from "../exchange/mexcClient";
import type { MexcOrderResponse, MexcMyTrade } from "../exchange/mexcOrderTypes";

const EPSILON = 1e-12;

type ReconciliationResult = {
  cycleId: number;
  symbol: string;
  ordersChecked: number;
  ordersUpdated: number;
  fillsChecked: number;
  fillsInserted: number;
  mismatches: string[];
};

function mapExchangeStatus(
  status: string,
): Parameters<typeof orderRepository.updateStatus>[1] {
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

  const mapped = statusMap[status];

  if (!mapped) {
    throw new Error(`Unsupported exchange order status: ${status}`);
  }

  return mapped;
}

function calculateTradeTotals(trades: MexcMyTrade[]) {
  let quantity = 0;
  let quoteValue = 0;

  for (const trade of trades) {
    const tradeQuantity = Number(trade.qty);
    const tradePrice = Number(trade.price);
    const tradeTime = Number(trade.time);

    if (
      !Number.isFinite(tradeQuantity) ||
      tradeQuantity <= 0 ||
      !Number.isFinite(tradePrice) ||
      tradePrice <= 0 ||
      !Number.isFinite(tradeTime) ||
      tradeTime <= 0
    ) {
      throw new Error(`Invalid exchange trade ${trade.id}.`);
    }

    quantity += tradeQuantity;
    quoteValue += tradeQuantity * tradePrice;
  }

  return {
    quantity,
    averagePrice: quantity > 0 ? quoteValue / quantity : null,
  };
}

function validateExchangeOrder(
  localOrder: {
    symbol: string;
    exchange_order_id: string | null;
    client_order_id: string;
    side: string;
    order_type: string;
    requested_quantity: number | null;
  },
  exchangeOrder: MexcOrderResponse,
): void {
  if (exchangeOrder.symbol !== localOrder.symbol) {
    throw new Error(
      `Order identity mismatch: local symbol ${localOrder.symbol}, exchange symbol ${exchangeOrder.symbol}.`,
    );
  }

  if (
    localOrder.exchange_order_id &&
    exchangeOrder.orderId !== localOrder.exchange_order_id
  ) {
    throw new Error(
      `Order identity mismatch: local exchange ID ${localOrder.exchange_order_id}, exchange ID ${exchangeOrder.orderId}.`,
    );
  }

  if (
    exchangeOrder.clientOrderId &&
    exchangeOrder.clientOrderId !== localOrder.client_order_id
  ) {
    throw new Error(
      `Order identity mismatch: local client ID ${localOrder.client_order_id}, exchange client ID ${exchangeOrder.clientOrderId}.`,
    );
  }

  if (
    exchangeOrder.side &&
    exchangeOrder.side.toUpperCase() !== localOrder.side
  ) {
    throw new Error(
      `Order side mismatch for local order ${localOrder.client_order_id}.`,
    );
  }

  const expectedExchangeType =
    localOrder.order_type === "INITIAL"
      ? "MARKET"
      : localOrder.order_type === "DCA"
        ? "LIMIT_MAKER"
        : "MARKET";

  if (
    exchangeOrder.type &&
    exchangeOrder.type.toUpperCase() !== expectedExchangeType
  ) {
    throw new Error(
      `Order type mismatch for local order ${localOrder.client_order_id}: expected ${expectedExchangeType}, received ${exchangeOrder.type}.`,
    );
  }

  const exchangeOriginalQuantity = Number(exchangeOrder.origQty);

  if (
    localOrder.requested_quantity !== null &&
    Number.isFinite(exchangeOriginalQuantity) &&
    exchangeOriginalQuantity > 0 &&
    Math.abs(
      exchangeOriginalQuantity - localOrder.requested_quantity,
    ) > EPSILON
  ) {
    throw new Error(
      `Order quantity mismatch for local order ${localOrder.client_order_id}.`,
    );
  }
}

export class ReconciliationService {
  async reconcileCycle(cycleId: number): Promise<ReconciliationResult> {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    const localOrders = orderRepository.findByCycleId(cycleId);
    const mismatches: string[] = [];

    let ordersUpdated = 0;
    let fillsChecked = 0;
    let fillsInserted = 0;

    for (const localOrder of localOrders) {
      if (!localOrder.exchange_order_id) {
        if (localOrder.status !== "PENDING") {
          mismatches.push(
            `Order ${localOrder.id} has no exchange order ID but status is ${localOrder.status}.`,
          );
        }

        continue;
      }

      const exchangeOrder: MexcOrderResponse = await mexcClient.getOrder(
        localOrder.symbol,
        localOrder.exchange_order_id,
      );

      validateExchangeOrder(localOrder, exchangeOrder);

      const exchangeExecutedQuantity = Number(
        exchangeOrder.executedQty,
      );

      if (
        !Number.isFinite(exchangeExecutedQuantity) ||
        exchangeExecutedQuantity < 0
      ) {
        throw new Error(
          `Invalid executed quantity for exchange order ${exchangeOrder.orderId}.`,
        );
      }

      const trades = await mexcClient.getMyTrades(
        localOrder.symbol,
        localOrder.exchange_order_id,
      );

      const tradeTotals = calculateTradeTotals(trades);

      fillsChecked += trades.length;

      if (
        tradeTotals.quantity >
        exchangeExecutedQuantity + EPSILON
      ) {
        mismatches.push(
          `Order ${localOrder.id}: trade quantity ${tradeTotals.quantity} exceeds exchange executed quantity ${exchangeExecutedQuantity}.`,
        );

        continue;
      }

      const exchangeStatus = mapExchangeStatus(
        exchangeOrder.status,
      );

      const statusChanged =
        localOrder.status !== exchangeStatus;

      const quantityChanged =
        Math.abs(
          localOrder.executed_quantity -
            exchangeExecutedQuantity,
        ) > EPSILON;

      const averagePriceChanged =
        tradeTotals.averagePrice !== null &&
        (localOrder.average_fill_price === null ||
          Math.abs(
            localOrder.average_fill_price -
              tradeTotals.averagePrice,
          ) > EPSILON);

      const shouldUpdateOrder =
        statusChanged ||
        quantityChanged ||
        averagePriceChanged;

      const persist = db.transaction(() => {
        let inserted = 0;

        for (const trade of trades) {
          if (fillRepository.findByExchangeTradeId(trade.id)) {
            continue;
          }

          const quantity = Number(trade.qty);
          const price = Number(trade.price);
          const fee = Number(trade.commission);

          if (
            !Number.isFinite(quantity) ||
            quantity <= 0 ||
            !Number.isFinite(price) ||
            price <= 0 ||
            !Number.isFinite(fee) ||
            fee < 0
          ) {
            throw new Error(`Invalid exchange trade ${trade.id}.`);
          }

          fillRepository.create({
            orderId: localOrder.id,
            cycleId,
            symbol: localOrder.symbol,
            exchangeTradeId: trade.id,
            quantity,
            price,
            fee,
            feeAsset: trade.commissionAsset,
            filledAt: new Date(trade.time).toISOString(),
          });

          inserted += 1;
        }

        if (shouldUpdateOrder) {
          orderRepository.updateStatus(
            localOrder.id,
            exchangeStatus,
            exchangeExecutedQuantity,
            tradeTotals.averagePrice ?? undefined,
          );
        }

        return inserted;
      });

      const inserted = persist.immediate();

      fillsInserted += inserted;

      if (shouldUpdateOrder) {
        ordersUpdated += 1;
      }
    }

    return {
      cycleId,
      symbol: cycle.symbol,
      ordersChecked: localOrders.length,
      ordersUpdated,
      fillsChecked,
      fillsInserted,
      mismatches,
    };
  }
}

export const reconciliationService = new ReconciliationService();
