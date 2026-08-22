export type ProductId = "standard" | "precision" | "rustproof";
export type PaletteType =
  | "source"
  | "cutter"
  | "lathe"
  | "drill"
  | "coater"
  | "exit";
export type OrderStatus = "scheduled" | "waiting" | "queued";

export interface ProductDefinition {
  id: ProductId;
  label: string;
  ariaLabel: string;
  colorToken: string;
  route: readonly PaletteType[];
}

export interface OrderScenarioRule {
  orderCount: number;
  arrivalWindow: readonly [number, number];
  deadlineLeadWindow: readonly [number, number];
  productPool: readonly ProductId[];
  paletteTypes: readonly PaletteType[];
}

export interface ScheduledOrder {
  id: string;
  levelId: number;
  productId: ProductId;
  arrivesAt: number;
  deadlineAt: number;
  status: OrderStatus;
}

export interface OrderScenario {
  levelId: number;
  seed: string | number;
  paletteTypes: readonly PaletteType[];
  orders: readonly ScheduledOrder[];
  queue: readonly string[];
}

export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>>;
export const ORDER_SCENARIO_RULES: Readonly<Record<number, OrderScenarioRule>>;
export function getProduct(productId: ProductId): ProductDefinition;
export function createSeededRandom(seed: string | number): () => number;
export function createOrderScenario(levelId: number, seed: string | number): OrderScenario;
export function shufflePaletteTypes(
  paletteTypes: readonly PaletteType[],
  seed: string | number,
): PaletteType[];
export function activateArrivedOrders(scenario: OrderScenario, elapsed: number): OrderScenario;
export function enqueueWaitingOrder(scenario: OrderScenario, orderId: string): OrderScenario;
export function moveQueuedOrder(
  scenario: OrderScenario,
  orderId: string,
  nextIndex: number,
): OrderScenario;
