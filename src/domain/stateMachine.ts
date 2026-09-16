import type {
  CycleStatus,
  DcaLevelStatus,
  OrderStatus,
  PositionStatus,
} from "./states";

const cycleTransitions: Record<CycleStatus, readonly CycleStatus[]> = {
  ACTIVE: ["CLOSED"],
  CLOSED: [],
};

const orderTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ["NEW", "FILLED", "CANCELED", "REJECTED", "EXPIRED"],
  NEW: ["PARTIALLY_FILLED", "FILLED", "CANCELED", "REJECTED", "EXPIRED"],
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCELED", "EXPIRED"],
  FILLED: [],
  CANCELED: [],
  REJECTED: [],
  EXPIRED: [],
};

const dcaTransitions: Record<
  DcaLevelStatus,
  readonly DcaLevelStatus[]
> = {
  PENDING: ["ORDERED", "SKIPPED"],
  ORDERED: ["FILLED", "SKIPPED"],
  FILLED: [],
  SKIPPED: [],
};

const positionTransitions: Record<
  PositionStatus,
  readonly PositionStatus[]
> = {
  EMPTY: ["OPEN"],
  OPEN: ["CLOSED"],
  CLOSED: [],
};

function assertTransition<T extends string>(
  kind: string,
  transitions: Record<T, readonly T[]>,
  from: T,
  to: T,
): void {
  if (from === to) {
    if (kind === "order" && from === "PARTIALLY_FILLED") {
      return;
    }

    throw new Error(
      `Invalid ${kind} state transition: ${from} -> ${to}`,
    );
  }

  if (!transitions[from].includes(to)) {
    throw new Error(
      `Invalid ${kind} state transition: ${from} -> ${to}`,
    );
  }
}

export function canTransitionCycle(
  from: CycleStatus,
  to: CycleStatus,
): boolean {
  return from === to || cycleTransitions[from].includes(to);
}

export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return (
    from === to &&
    from === "PARTIALLY_FILLED"
  ) || orderTransitions[from].includes(to);
}

export function canTransitionDcaLevel(
  from: DcaLevelStatus,
  to: DcaLevelStatus,
): boolean {
  return from === to || dcaTransitions[from].includes(to);
}

export function canTransitionPosition(
  from: PositionStatus,
  to: PositionStatus,
): boolean {
  return from === to || positionTransitions[from].includes(to);
}

export function transitionCycle(
  from: CycleStatus,
  to: CycleStatus,
): CycleStatus {
  assertTransition("cycle", cycleTransitions, from, to);
  return to;
}

export function transitionOrder(
  from: OrderStatus,
  to: OrderStatus,
): OrderStatus {
  assertTransition("order", orderTransitions, from, to);
  return to;
}

export function transitionDcaLevel(
  from: DcaLevelStatus,
  to: DcaLevelStatus,
): DcaLevelStatus {
  assertTransition("DCA level", dcaTransitions, from, to);
  return to;
}

export function transitionPosition(
  from: PositionStatus,
  to: PositionStatus,
): PositionStatus {
  assertTransition("position", positionTransitions, from, to);
  return to;
}

export function assertCycleActive(status: CycleStatus): void {
  if (status !== "ACTIVE") {
    throw new Error(`Cycle must be ACTIVE, received: ${status}`);
  }
}

export function assertCycleClosed(status: CycleStatus): void {
  if (status !== "CLOSED") {
    throw new Error(`Cycle must be CLOSED, received: ${status}`);
  }
}
