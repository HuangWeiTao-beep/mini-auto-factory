export type DeviceType = "source" | "cutter" | "lathe" | "exit";
export type MaterialType = "rod" | "blank" | "bolt";
export type GameMode = "design" | "running" | "paused" | "success" | "failure";

export interface Device {
  id: string;
  type: DeviceType;
  x: number;
  y: number;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
}

export interface FactoryDesign {
  devices: Record<string, Device>;
  connections: Connection[];
}

export interface LineState extends Connection {
  item: null | { kind: MaterialType; progress: number; status: string };
}

export interface ProductionState {
  mode: GameMode;
  elapsed: number;
  completed: number;
  source: { elapsed: number; output: MaterialType | null; pulse: number };
  machines: Record<string, {
    status: string;
    active: MaterialType | null;
    remaining: number;
    waiting: MaterialType | null;
    output: MaterialType | null;
    warning: string | null;
  }>;
  lines: Record<string, LineState>;
  warning: string | null;
}

export const DEVICE_TYPES: Record<DeviceType, { label: string; accepts: MaterialType | null; produces: MaterialType | null; duration: number }>;
export const MATERIALS: Record<MaterialType, { label: string; shortLabel: string }>;
export const LEVEL_CONFIG: { duration: number; target: number; transportDuration: number; sourceInterval: number; step: number };
export function createEmptyDesign(): FactoryDesign;
export function addDevice(design: FactoryDesign, type: DeviceType, x: number, y: number, id?: string): FactoryDesign;
export function moveDevice(design: FactoryDesign, id: string, x: number, y: number): FactoryDesign;
export function connectDevices(design: FactoryDesign, from: string, to: string): FactoryDesign;
export function removeConnection(design: FactoryDesign, connectionId: string): FactoryDesign;
export function createProductionState(design: FactoryDesign): ProductionState;
export function startProduction(state: ProductionState, options?: { edited?: boolean; design?: FactoryDesign }): ProductionState;
export function pauseProduction(state: ProductionState): ProductionState;
export function advanceProduction(state: ProductionState, design: FactoryDesign, deltaSeconds: number): ProductionState;
