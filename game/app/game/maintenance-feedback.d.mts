import type {
  FactoryDesign,
  LevelConfig,
  MaintenanceStatus,
  ProcessingDeviceType,
  ProductionState,
} from "./factory-model.mjs";

export interface MaintenanceMachineFeedback {
  id: string;
  type: ProcessingDeviceType;
  label: string;
  band: "normal" | "warning" | "danger" | "failed";
  wear: number;
  remainingCycles: number;
  reliabilityStatus: MaintenanceStatus;
  idle: boolean;
  maintenanceJob: null | {
    machineId: string;
    kind: "planned" | "repair";
    remaining: number;
    status: "active" | "queued";
    queueIndex: number;
  };
}

export type MaintenanceRecommendation =
  | { kind: "scheduleMaintenance" | "prioritizeRepair"; machineId: string; message: string }
  | { kind: "monitor" | "stable"; message: string };

export interface MaintenanceFeedback {
  machines: readonly MaintenanceMachineFeedback[];
  recommendation: MaintenanceRecommendation;
}

export function getMaintenanceFeedback(input: {
  state: ProductionState;
  design: FactoryDesign;
  level: LevelConfig;
}): MaintenanceFeedback;
