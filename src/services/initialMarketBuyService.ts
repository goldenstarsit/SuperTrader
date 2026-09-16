import { randomUUID } from "node:crypto";
import type { MexcClient } from "../exchange/mexcClient";
import { calculateMinimumMarketBuyQuoteAmount } from "../trading/marketBuyQuoteCalculator";
import { orderRepository } from "../database/repositories/orderRepository";
import { tradingCycleRepository } from "../database/repositories/tradingCycleRepository";
import type { MexcSymbolRules } from "../exchange/mexcSymbolRules";

export class InitialMarketBuyService {
  constructor(private readonly mexcClient: MexcClient) {}

  async prepare(cycleId: number, rules: MexcSymbolRules) {
    const cycle = tradingCycleRepository.findById(cycleId);

    if (!cycle) {
      throw new Error(`Trading cycle ${cycleId} not found.`);
    }

    if (cycle.status !== "ACTIVE") {
      throw new Error(`Trading cycle ${cycleId} is not ACTIVE.`);
    }

    const existingOrder = orderRepository
      .findByCycleId(cycleId)
      .find((order) => order.order_type === "INITIAL");

    if (existingOrder) {
      return {
        created: false,
        order: existingOrder,
      };
    }

    const quoteAmount = calculateMinimumMarketBuyQuoteAmount({
      quoteAmountPrecisionMarket: rules.quoteAmountPrecisionMarket,
      maxQuoteAmountMarket: rules.maxQuoteAmountMarket,
    });

    const clientOrderId = `st-${cycleId}-${randomUUID().replaceAll("-", "").slice(0, 20)}`;

    const orderId = orderRepository.create({
      cycleId,
      symbol: cycle.symbol,
      clientOrderId,
      orderType: "INITIAL",
      side: "BUY",
      executionType: "MARKET",
      requestedQuantity: undefined,
      requestedQuoteQuantity: quoteAmount,
    });

    const order = orderRepository.findById(orderId);

    if (!order) {
      throw new Error(`Initial order ${orderId} could not be persisted.`);
    }

    return {
      created: true,
      order,
      quoteAmount,
    };
  }

  async submit(cycleId: number, rules: MexcSymbolRules) {
    const prepared = await this.prepare(cycleId, rules);

    if (!prepared.created) {
      return {
        submitted: false,
        reason: "INITIAL_ORDER_ALREADY_EXISTS",
        order: prepared.order,
      };
    }

    if (prepared.quoteAmount === undefined) {
      throw new Error("Initial Market BUY quote amount is missing.");
    }

    const response = await this.mexcClient.placeMarketBuy(
      prepared.order.symbol,
      prepared.quoteAmount,
      prepared.order.client_order_id,
    );

    orderRepository.setExchangeOrderId(
      prepared.order.id,
      response.orderId,
    );

    return {
      submitted: true,
      order: orderRepository.findById(prepared.order.id),
      exchangeOrderId: response.orderId,
    };
  }
}
