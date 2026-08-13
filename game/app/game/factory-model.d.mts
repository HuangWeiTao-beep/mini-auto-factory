export type DeviceType = "source" | "cutter" | "lathe" | "drill" | "exit";
export type LevelDeviceType = DeviceType;
export type MaterialType = "rod" | "blank" | "undrilledBolt" | "bolt";
export type GameMode = "design" | "running" | "paused" | "success" | "failure";
export type TransportMode = "fixed" | "distance";

export interface GridCell {
  gridX: number;
  gridY: number;
}

export interface LevelConfig {
  id: number;
  name: string;
  routeHint: string;
  duration: number;
  target: number;
  deviceLimits: Readonly<Record<LevelDeviceType, number>>;
  transportMode: TransportMode;
  transportDuration: number;
  sourceInterval: number;
  machineDurations: Readonly<Record<"cutter" | "lathe" | "drill", number>>;
  obstacles: readonly GridCell[];
  step: number;
}

export interface Device {
  id: string;
  type: DeviceType;
  x: number;
  y: number;
  gridX: number;
  gridY: number;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  branchIndex: number;
}

export interface FactoryDesign {
  devices: Record<string, Device>;
  connections: Connection[];
}

export interface LineState extends Connection {
  item: null | {
    kind: MaterialType;
    progress: number;
    status: string;
    transportDuration: number;
  };
}

export interface SourceState {
  elapsed: number;
  output: MaterialType | null;
  pulse: number;
}

export interface ProductionState {
  mode: GameMode;
  elapsed: number;
  completed: number;
  sources: Record<string, SourceState>;
  machines: Record<string, {
    status: string;
    active: MaterialType | null;
    remaining: number;
    waiting: MaterialType | null;
    output: MaterialType | null;
    warning: string | null;
  }>;
  routingCursor: Record<string, number>;
  lines: Record<string, LineState>;
  warning: string | null;
}

export const DEVICE_TYPES: Record<DeviceType, { label: string; accepts: MaterialType | null; produces: MaterialType | null; duration: number }>;
export const PROCESSING_TYPES: ReadonlySet<"cutter" | "lathe" | "drill">;
export const MATERIALS: Record<MaterialType, { label: string; shortLabel: string }>;
export const LEVELS: Readonly<Record<number, LevelConfig>>;
export const LEVEL_CONFIG: LevelConfig;
export function getLevelConfig(levelId: number): LevelConfig | undefined;
export function getDeviceLimit(level: LevelConfig, type: LevelDeviceType): number;
export function getTransportDuration(level: LevelConfig, from: GridCell, to: GridCell): number;
export function nextUnlockedLevel(unlockedLevel: number, completedLevelId: number): number;
export function createEmptyDesign(): FactoryDesign;
export function addDevice(design: FactoryDesign, type: DeviceType, x: number, y: number, id?: string): FactoryDesign;
export function moveDevice(design: FactoryDesign, id: string, x: number, y: number): FactoryDesign;
export function canPlaceDevice(design: FactoryDesign, level: LevelConfig, cell: GridCell, ignoredDeviceId?: string | null): boolean;
export function connectDevices(design: FactoryDesign, from: string, to: string, level?: LevelConfig): FactoryDesign;
export function removeConnection(design: FactoryDesign, connectionId: string): FactoryDesign;
export function outgoing(design: FactoryDesign, deviceId: string): Connection[];
export function createProductionState(design: FactoryDesign, level: LevelConfig): ProductionState;
export function startProduction(state: ProductionState, options: { edited: boolean; design: FactoryDesign; level: LevelConfig }): ProductionState;
export function pauseProduction(state: ProductionState): ProductionState;
export function advanceProduction(state: ProductionState, design: FactoryDesign, level: LevelConfig, deltaSeconds: number): ProductionState;
