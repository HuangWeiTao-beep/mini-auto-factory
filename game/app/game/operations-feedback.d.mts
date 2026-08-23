import type {
  FactoryDesign,
  LevelConfig,
  ProductionOrder,
  ProductionState,
} from "./factory-model.mjs";
import type { MaintenanceFeedback } from "./maintenance-feedback.mjs";
import type { SchedulingFeedback } from "./scheduling-feedback.mjs";

export type OperationsRecommendation =
  | { kind: "enqueue" | "moveToFront"; orderId: string; message: string }
  | { kind: "scheduleMaintenance" | "prioritizeRepair"; machineId: string; message: string }
  | { kind: "monitor" | "route" | "stable"; message: string };

export interface OperationsFeedback {
  scheduling: SchedulingFeedback;
  maintenance: MaintenanceFeedback;
  recommendation: OperationsRecommendation;
}

export function getOperationsFeedback(input: {
  design: FactoryDesign;
  level: LevelConfig;
  state: ProductionState;
  orders: readonly ProductionOrder[];
  queue: readonly string[];
  elapsed: number;
  cacheKey?: string | null;
}): OperationsFeedback;
