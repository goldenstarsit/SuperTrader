import { isMexcOrderNotFoundError } from "../exchange/mexcOrderRecovery";
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

    const clientOrderId = `st-initial-${cycleId}`;

    const result = orderRepository.createInitialIfAbsent({
      cycleId,
      symbol: cycle.symbol,
      clientOrderId,
      requestedQuoteQuantity: quoteAmount,
    });

    return {
      created: result.created,
      order: result.order,
      ...(result.created ? { quoteAmount } : {}),
    };
  }

  async submit(cycleId: number, rules: MexcSymbolRules) {
    const prepared = await this.prepare(cycleId, rules);

    const quoteAmount =
      prepared.quoteAmount ?? prepared.order.requested_quote_quantity;

    if (quoteAmount === null || quoteAmount === undefined) {
      throw new Error("Initial Market BUY quote amount is missing.");
    }

    if (prepared.order.exchange_order_id) {
      return {
        submitted: false,
        reason: "INITIAL_ORDER_ALREADY_SUBMITTED",
        order: prepared.order,
        exchangeOrderId: prepared.order.exchange_order_id,
      };
    }

    try {
      const existingExchangeOrder = await this.mexcClient.getOrder(
        prepared.order.symbol,
        undefined,
        prepared.order.client_order_id,
      );

      orderRepository.setExchangeOrderId(
        prepared.order.id,
        existingExchangeOrder.orderId,
      );

      return {
        submitted: false,
        reason: "INITIAL_ORDER_RECOVERED_FROM_EXCHANGE",
        order: orderRepository.findById(prepared.order.id),
        exchangeOrderId: existingExchangeOrder.orderId,
      };
    } catch (error) {
      if (!isMexcOrderNotFoundError(error)) {
        throw error;
      }
    }

    const response = await this.mexcClient.placeMarketBuy(
      prepared.order.symbol,
      quoteAmount,
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
