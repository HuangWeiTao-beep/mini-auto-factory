export type ReliabilityStatus = "available" | "maintenance-pending" | "under-maintenance" | "broken";
export type MaintenanceKind = "planned" | "repair";
export type ReliabilityBand = "normal" | "warning" | "danger" | "failed";

export interface MachineReliability {
  wear: number;
  status: ReliabilityStatus;
}

export interface StructuralMachine {
  active?: unknown;
  output?: unknown;
  reliability?: MachineReliability;
}

export interface MaintenanceConfig {
  plannedDuration: number;
  repairDuration: number;
  slowdownThreshold: number;
  failureThreshold: number;
  wearPerCycle: Record<string, number>;
  objective?: null | {
    plannedCompletions: number;
    queueReorders: number;
  };
}

export interface MaintenanceJob {
  machineId: string;
  kind: MaintenanceKind;
  remaining: number;
}

export interface MaintenanceState {
  activeJob: MaintenanceJob | null;
  queue: MaintenanceJob[];
  plannedCompleted: number;
  queueReorders: number;
}

export interface MaintenanceJobView extends MaintenanceJob {
  status: "active" | "queued";
  queueIndex: number;
}

export interface MaintenanceLevel {
  maintenance?: MaintenanceConfig;
}

export interface RuntimeState {
  machines: Record<string, StructuralMachine>;
  maintenance: MaintenanceState;
}

export interface StructuralMaintenanceState {
  maintenance?: MaintenanceState;
}

export interface ReliabilityView {
  band: ReliabilityBand;
  wear: number;
  remainingCycles: number;
}

export const createMachineReliability: () => MachineReliability;
export const createMaintenanceState: () => MaintenanceState;
export function getReliabilityView(machine: StructuralMachine, deviceType: string, level: MaintenanceLevel): ReliabilityView;
export function getProcessingDuration(machine: StructuralMachine, baseDuration: number, level: MaintenanceLevel): number;
export function requestMaintenance(state: RuntimeState, machineId: string, level: MaintenanceLevel): RuntimeState;
export function cancelMaintenanceRequest(state: RuntimeState, machineId: string): RuntimeState;
export function moveMaintenanceRequest(state: RuntimeState, machineId: string, nextIndex: number): RuntimeState;
export function getMaintenanceJobView(state: StructuralMaintenanceState, machineId: string): MaintenanceJobView | null;
export function applyCompletedMachineCycle(state: RuntimeState, machineId: string, deviceType: string, level: MaintenanceLevel): RuntimeState;
export function advanceMaintenance(state: RuntimeState, level: MaintenanceLevel, delta: number): RuntimeState;
export function canMachineAcceptMaterial(machine: StructuralMachine): boolean;
