export type DeviceType = "source" | "cutter" | "lathe" | "drill" | "coater" | "exit";
export type LevelDeviceType = DeviceType;
export type ProcessingDeviceType = "cutter" | "lathe" | "drill" | "coater";
export type MaterialType = "rod" | "blank" | "undrilledBolt" | "bolt" | "coatedBolt";
export type GameMode = "design" | "running" | "paused" | "success" | "failure";
export type TransportMode = "fixed" | "distance";
export type LevelMode = "production" | "orderScheduling";
export type ProductId = "standard" | "precision" | "rustproof";
export type OrderStatus =
  | "scheduled"
  | "waiting"
  | "queued"
  | "inProduction"
  | "completed"
  | "overdue";

export interface ConnectionRules {
  allowsParallelInputs: boolean;
  allowsParallelOutputs: boolean;
}

export interface OrderConfig {
  orderCount: number;
  arrivalWindow: readonly [number, number];
  deadlineLeadWindow: readonly [number, number];
  productPool: readonly ("standard" | "precision" | "rustproof")[];
  paletteTypes: readonly LevelDeviceType[];
}

export interface GridCell {
  gridX: number;
  gridY: number;
}

export interface LevelConfig {
  id: number;
  chapter: 1 | 2;
  mode: LevelMode;
  name: string;
  routeHint: string;
  duration: number;
  target: number;
  deviceLimits: Readonly<Partial<Record<LevelDeviceType, number>>>;
  transportMode: TransportMode;
  transportDuration: number;
  sourceInterval: number;
  machineDurations: Readonly<Partial<Record<ProcessingDeviceType, number>>>;
  connectionRules: ConnectionRules;
  paletteTypes: readonly LevelDeviceType[];
  orderConfig: OrderConfig | null;
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

export interface ProductionOrder {
  id: string;
  levelId: number;
  productId: ProductId;
  arrivesAt: number;
  deadlineAt: number;
  status: OrderStatus;
}

export interface ProductionScenario {
  levelId: number;
  seed: string | number;
  paletteTypes: readonly LevelDeviceType[];
  orders: readonly ProductionOrder[];
  queue: readonly string[];
}

export interface OrderMaterial {
  kind: MaterialType;
  orderId: string;
  productId: ProductId;
  recipeStepIndex: number;
}

export interface OrderFailure {
  orderId: string;
  productId: ProductId;
  overdueSeconds: number;
}

export interface LineState extends Connection {
  item: null | {
    kind: MaterialType;
    orderId?: string;
    productId?: ProductId;
    recipeStepIndex?: number;
    progress: number;
    status: string;
    transportDuration: number;
  };
}

export interface SourceState {
  elapsed: number;
  output: MaterialType | OrderMaterial | null;
  pulse: number;
}

export interface ProductionState {
  mode: GameMode;
  elapsed: number;
  completed: number;
  sources: Record<string, SourceState>;
  machines: Record<string, {
    status: string;
    active: MaterialType | OrderMaterial | null;
    remaining: number;
    waiting: MaterialType | OrderMaterial | null;
    output: MaterialType | OrderMaterial | null;
    warning: string | null;
  }>;
  routingCursor: Record<string, number>;
  lines: Record<string, LineState>;
  warning: string | null;
  orders?: ProductionOrder[];
  queue?: string[];
  completedOrderIds?: string[];
  failure?: OrderFailure | null;
  scenarioSeed?: string | number | null;
  scenarioLevelId?: number;
}

export const DEVICE_TYPES: Record<DeviceType, {
  label: string;
  accepts: MaterialType | null;
  produces: MaterialType | null;
  duration: number;
  inputs: readonly MaterialType[];
  outputs: readonly MaterialType[];
  width: number;
  height: number;
  icon: string;
  eyebrow: string;
}>;
export const PROCESSING_TYPES: ReadonlySet<ProcessingDeviceType>;
export const MATERIALS: Record<MaterialType, { label: string; shortLabel: string }>;
export const LEVELS: Readonly<Record<number, LevelConfig>>;
export const LEVEL_CONFIG: LevelConfig;
export function getLevelConfig(levelId: number): LevelConfig | undefined;
export function isOrderSchedulingLevel(levelOrId: number | LevelConfig): boolean;
export function getAllowedPaletteTypes(level: LevelConfig): LevelDeviceType[];
export function getDeviceLimit(level: LevelConfig, type: LevelDeviceType): number;
export function getTransportDuration(level: LevelConfig, from: GridCell, to: GridCell): number;
export function nextUnlockedLevel(unlockedLevel: number, completedLevelId: number): number;
export function createEmptyDesign(): FactoryDesign;
export function createOrderScenario(
  levelId: number,
  seed: string | number,
): ProductionScenario;
export function addDevice(design: FactoryDesign, type: DeviceType, x: number, y: number, id?: string): FactoryDesign;
export function moveDevice(design: FactoryDesign, id: string, x: number, y: number): FactoryDesign;
export function canPlaceDevice(design: FactoryDesign, level: LevelConfig, cell: GridCell, ignoredDeviceId?: string | null): boolean;
export function connectDevices(design: FactoryDesign, from: string, to: string, level?: LevelConfig): FactoryDesign;
export function removeConnection(design: FactoryDesign, connectionId: string): FactoryDesign;
export function outgoing(design: FactoryDesign, deviceId: string): Connection[];
export function createProductionState(
  design: FactoryDesign,
  level?: LevelConfig,
  scenario?: ProductionScenario,
): ProductionState;
export function enqueueProductionOrder(
  state: ProductionState,
  orderId: string,
): ProductionState;
export function moveProductionOrder(
  state: ProductionState,
  orderId: string,
  nextIndex: number,
): ProductionState;
export function startProduction(state: ProductionState, options: { edited: boolean; design: FactoryDesign; level: LevelConfig }): ProductionState;
export function pauseProduction(state: ProductionState): ProductionState;
export function forecastOrderCompletionTimes(
  state: ProductionState,
  design: FactoryDesign,
  level: LevelConfig,
  queue?: readonly string[],
): Map<string, number>;
export function advanceProduction(state: ProductionState, design: FactoryDesign, level: LevelConfig, deltaSeconds: number): ProductionState;
