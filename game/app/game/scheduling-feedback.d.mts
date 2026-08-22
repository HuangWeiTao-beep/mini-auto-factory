import type { FactoryDesign, LevelConfig, ProductionOrder, ProductionState } from "./factory-model.mjs";

export type OrderRouteFeedback =
  | { status: "ready" }
  | { status: "missing"; missingLink: string };

export type OrderForecast =
  | { status: "scheduled" | "inProduction" | "blocked"; expectedAt?: undefined; slack?: undefined }
  | {
      status: "safe" | "attention" | "danger" | "late";
      expectedAt: number;
      slack: number;
    };

export interface SchedulingOrderFeedback {
  id: string;
  queueIndex: number;
  route: OrderRouteFeedback;
  forecast: OrderForecast | null;
}

export interface SchedulingFeedback {
  orders: readonly SchedulingOrderFeedback[];
  recommendation: {
    kind: "route" | "enqueue" | "moveToFront" | "monitor" | "stable";
    orderId: string | null;
    message: string;
  };
}

export function getSchedulingFeedback(input: {
  design: FactoryDesign;
  level: LevelConfig;
  state?: ProductionState;
  orders: readonly ProductionOrder[];
  queue: readonly string[];
  elapsed: number;
  cacheKey?: string | null;
}): SchedulingFeedback;
