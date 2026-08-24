import {
  GRID,
  MACHINE,
  isObstaclePlacement,
  manhattanDistance,
  snapToGrid,
} from "./factory-grid.mjs";
import {
  ORDER_SCENARIO_RULES,
  PRODUCTS,
  activateArrivedOrders,
  createOrderScenarioCandidate,
  createSafeOrderScenarioCandidate,
  enqueueWaitingOrder,
  moveQueuedOrder,
} from "./order-scheduling.mjs";
import {
  advanceMaintenance,
  applyCompletedMachineCycle,
  canMachineAcceptMaterial,
  createMachineReliability,
  createMaintenanceState,
  getReliabilityView,
  getProcessingDuration,
  moveMaintenanceRequest,
  requestMaintenance,
} from "./maintenance-model.mjs";

const createDeviceSpec = (label, accepts, produces, duration, icon, eyebrow) =>
  Object.freeze({
    label,
    accepts,
    produces,
    duration,
    inputs: accepts ? Object.freeze([accepts]) : Object.freeze([]),
    outputs: produces ? Object.freeze([produces]) : Object.freeze([]),
    width: MACHINE.width,
    height: MACHINE.height,
    icon,
    eyebrow,
  });

export const DEVICE_TYPES = Object.freeze({
  source: createDeviceSpec("钢棒源", null, "rod", 3, "▰", "SOURCE 01"),
  cutter: createDeviceSpec("切割机", "rod", "blank", 2, "✂", "CUTTER 02"),
  lathe: createDeviceSpec("车削机", "blank", "bolt", 3, "⚙", "LATHE 03"),
  drill: createDeviceSpec("钻孔机", "undrilledBolt", "bolt", 2, "◉", "DRILL 04"),
  coater: createDeviceSpec("镀层机", "bolt", "coatedBolt", 2, "◌", "COATER 05"),
  heatTreater: createDeviceSpec("热处理炉", "bolt", "hardenedBolt", 3, "♨", "HEAT 06"),
  exit: createDeviceSpec("成品出口", "bolt", null, 0, "✓", "EXIT 99"),
});

export const PROCESSING_TYPES = new Set(["cutter", "lathe", "drill", "coater", "heatTreater"]);

export const MATERIALS = Object.freeze({
  rod: { label: "长钢棒", shortLabel: "钢棒" },
  blank: { label: "短料", shortLabel: "短料" },
  bolt: { label: "螺栓", shortLabel: "螺栓" },
  undrilledBolt: { label: "未钻孔螺栓", shortLabel: "未钻孔" },
  coatedBolt: { label: "防锈螺栓", shortLabel: "防锈" },
  hardenedBolt: { label: "强化螺栓", shortLabel: "强化" },
});

const DEFAULT_CONNECTION_RULES = Object.freeze({
  allowsParallelInputs: false,
  allowsParallelOutputs: false,
});

const freezeLevel = (level) =>
  Object.freeze({
    ...level,
    connectionRules: Object.freeze({
      ...DEFAULT_CONNECTION_RULES,
      ...(level.connectionRules ?? {}),
    }),
    deviceLimits: Object.freeze({ ...level.deviceLimits }),
    machineDurations: Object.freeze({ ...level.machineDurations }),
    paletteTypes: Object.freeze([...(level.paletteTypes ?? [])]),
    obstacles: Object.freeze(
      level.obstacles.map((obstacle) => Object.freeze({ ...obstacle })),
    ),
    orderConfig: level.orderConfig
      ? Object.freeze({
          ...level.orderConfig,
          arrivalWindow: Object.freeze([...level.orderConfig.arrivalWindow]),
          deadlineLeadWindow: Object.freeze([
            ...level.orderConfig.deadlineLeadWindow,
          ]),
          productPool: Object.freeze([...level.orderConfig.productPool]),
        })
      : null,
    maintenance: level.maintenance
      ? Object.freeze({
          ...level.maintenance,
          wearPerCycle: Object.freeze({ ...level.maintenance.wearPerCycle }),
          objective: level.maintenance.objective
            ? Object.freeze({ ...level.maintenance.objective })
            : null,
        })
      : null,
  });

export const LEVELS = Object.freeze({
  1: freezeLevel({
    id: 1,
    chapter: 1,
    mode: "production",
    name: "螺栓生产",
    routeHint: "钢棒源 → 切割机 → 车削机 → 成品出口",
    duration: 60,
    target: 10,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 0, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2 },
    obstacles: [],
    connectionRules: DEFAULT_CONNECTION_RULES,
    paletteTypes: ["source", "cutter", "lathe", "exit"],
    orderConfig: null,
    step: 0.01,
  }),
  2: freezeLevel({
    id: 2,
    chapter: 1,
    mode: "production",
    name: "钻孔定位",
    routeHint: "钢棒源 → 切割机 → 车削机 → 钻孔机 → 成品出口",
    duration: 45,
    target: 10,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2 },
    obstacles: [],
    connectionRules: DEFAULT_CONNECTION_RULES,
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
    orderConfig: null,
    step: 0.01,
  }),
  3: freezeLevel({
    id: 3,
    chapter: 1,
    mode: "production",
    name: "产能告急",
    routeHint: "两条对称支路汇入成品出口",
    duration: 27,
    target: 12,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 1,
    machineDurations: { cutter: 1, lathe: 3, drill: 1 },
    obstacles: [],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
    orderConfig: null,
    step: 0.01,
  }),
  4: freezeLevel({
    id: 4,
    chapter: 1,
    mode: "production",
    name: "有限工位",
    routeHint: "避开障碍，缩短关键连接",
    duration: 48,
    target: 10,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2 },
    obstacles: [
      { gridX: 7, gridY: 3 },
      { gridX: 12, gridY: 7 },
      { gridX: 17, gridY: 3 },
    ],
    connectionRules: DEFAULT_CONNECTION_RULES,
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
    orderConfig: null,
    step: 0.01,
  }),
  5: freezeLevel({
    id: 5,
    chapter: 1,
    mode: "production",
    name: "工坊验收",
    routeHint: "两条紧凑支路汇入成品出口",
    duration: 36,
    target: 14,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 1,
    machineDurations: { cutter: 1, lathe: 3, drill: 1 },
    obstacles: [
      { gridX: 7, gridY: 3 },
      { gridX: 12, gridY: 7 },
      { gridX: 17, gridY: 3 },
      { gridX: 7, gridY: 10 },
      { gridX: 17, gridY: 10 },
    ],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
    orderConfig: null,
    step: 0.01,
  }),
  6: freezeLevel({
    id: 6,
    chapter: 2,
    mode: "orderScheduling",
    name: "订单看板",
    routeHint: "普通与精密订单开始排队，你得先学会分拣。",
    duration: 70,
    target: ORDER_SCENARIO_RULES[6].orderCount,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, coater: 0, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
    obstacles: [],
    connectionRules: {
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[6].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[6],
    step: 0.01,
  }),
  7: freezeLevel({
    id: 7,
    chapter: 2,
    mode: "orderScheduling",
    name: "双线调度",
    routeHint: "同一时段会来两种订单，单线思维差不多该退休了。",
    duration: 75,
    target: ORDER_SCENARIO_RULES[7].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 0, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 2,
    machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
    obstacles: [{ gridX: 8, gridY: 4 }, { gridX: 13, gridY: 8 }],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[7].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[7],
    step: 0.01,
  }),
  8: freezeLevel({
    id: 8,
    chapter: 2,
    mode: "orderScheduling",
    name: "镀层介入",
    routeHint: "防锈单登场，工艺路线开始分叉。",
    duration: 80,
    target: ORDER_SCENARIO_RULES[8].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 1, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 2,
    machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
    obstacles: [{ gridX: 8, gridY: 4 }, { gridX: 13, gridY: 8 }],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[8].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[8],
    step: 0.01,
  }),
  9: freezeLevel({
    id: 9,
    chapter: 2,
    mode: "orderScheduling",
    name: "混单瓶颈",
    routeHint: "钻孔与镀层争抢节拍，瓶颈这位老朋友又来了。",
    duration: 85,
    target: ORDER_SCENARIO_RULES[9].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 1, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 1,
    machineDurations: { cutter: 1, lathe: 3, drill: 2, coater: 2 },
    obstacles: [
      { gridX: 6, gridY: 3 },
      { gridX: 10, gridY: 6 },
      { gridX: 15, gridY: 9 },
    ],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[9].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[9],
    step: 0.01,
  }),
  10: freezeLevel({
    id: 10,
    chapter: 2,
    mode: "orderScheduling",
    name: "总装排程",
    routeHint: "所有单型一起上，调度要是乱了就别怪看板嘲笑你。",
    duration: 90,
    target: ORDER_SCENARIO_RULES[10].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, coater: 1, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 1,
    machineDurations: { cutter: 1, lathe: 3, drill: 1, coater: 2 },
    obstacles: [
      { gridX: 6, gridY: 3 },
      { gridX: 10, gridY: 6 },
      { gridX: 15, gridY: 9 },
      { gridX: 18, gridY: 4 },
    ],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[10].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[10],
    step: 0.01,
  }),
  11: freezeLevel({
    id: 11,
    chapter: 3,
    mode: "production",
    name: "预防维护",
    routeHint: "预警不是装饰；在车削机故障前安排计划维护。",
    duration: 58,
    target: 10,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 0, coater: 0, heatTreater: 0, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3 },
    obstacles: [],
    connectionRules: DEFAULT_CONNECTION_RULES,
    paletteTypes: ["source", "cutter", "lathe", "exit"],
    orderConfig: null,
    maintenance: {
      plannedDuration: 4,
      repairDuration: 7,
      slowdownThreshold: 85,
      failureThreshold: 100,
      wearPerCycle: { cutter: 8, lathe: 18 },
      objective: { plannedCompletions: 1, queueReorders: 0 },
    },
    step: 0.01,
  }),
  12: freezeLevel({
    id: 12,
    chapter: 3,
    mode: "production",
    name: "维修冲突",
    routeHint: "多台设备同时预警时，维修队的顺序就是产能。",
    duration: 68,
    target: 10,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, coater: 0, heatTreater: 0, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2 },
    obstacles: [],
    connectionRules: DEFAULT_CONNECTION_RULES,
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
    orderConfig: null,
    maintenance: {
      plannedDuration: 4,
      repairDuration: 7,
      slowdownThreshold: 85,
      failureThreshold: 100,
      wearPerCycle: { cutter: 10, lathe: 14, drill: 18 },
      objective: { plannedCompletions: 2, queueReorders: 1 },
    },
    step: 0.01,
  }),
  13: freezeLevel({
    id: 13,
    chapter: 3,
    mode: "orderScheduling",
    name: "热处理试产",
    routeHint: "强化螺栓必须经过热处理炉；它也最会磨洋工。",
    duration: 64,
    target: ORDER_SCENARIO_RULES[13].orderCount,
    deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, coater: 0, heatTreater: 1, exit: 1 },
    transportMode: "fixed",
    transportDuration: 0.5,
    sourceInterval: 3,
    machineDurations: { cutter: 2, lathe: 3, drill: 2, heatTreater: 3 },
    obstacles: [],
    connectionRules: {
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[13].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[13],
    maintenance: {
      plannedDuration: 4,
      repairDuration: 7,
      slowdownThreshold: 85,
      failureThreshold: 100,
      wearPerCycle: { cutter: 13, lathe: 15, drill: 25, heatTreater: 40 },
      objective: { plannedCompletions: 1, queueReorders: 0 },
    },
    step: 0.01,
  }),
  14: freezeLevel({
    id: 14,
    chapter: 3,
    mode: "orderScheduling",
    name: "四线协同",
    routeHint: "四种产品一起抢设备，维修优先级得比直觉更靠谱。",
    duration: 78,
    target: ORDER_SCENARIO_RULES[14].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 1, heatTreater: 1, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 2,
    machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2, heatTreater: 3 },
    obstacles: [],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[14].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[14],
    maintenance: {
      plannedDuration: 4,
      repairDuration: 7,
      slowdownThreshold: 85,
      failureThreshold: 100,
      wearPerCycle: { cutter: 12, lathe: 14, drill: 24, coater: 28, heatTreater: 38 },
      objective: { plannedCompletions: 1, queueReorders: 0 },
    },
    step: 0.01,
  }),
  15: freezeLevel({
    id: 15,
    chapter: 3,
    mode: "orderScheduling",
    name: "可靠性审计",
    routeHint: "订单、磨损和停机窗口都来凑热闹；别让维修队排成行为艺术。",
    duration: 92,
    target: ORDER_SCENARIO_RULES[15].orderCount,
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 1, heatTreater: 1, exit: 1 },
    transportMode: "distance",
    transportDuration: 0.5,
    sourceInterval: 1,
    machineDurations: { cutter: 1, lathe: 3, drill: 2, coater: 2, heatTreater: 3 },
    obstacles: [],
    connectionRules: {
      allowsParallelInputs: true,
      allowsParallelOutputs: true,
    },
    paletteTypes: ORDER_SCENARIO_RULES[15].paletteTypes,
    orderConfig: ORDER_SCENARIO_RULES[15],
    maintenance: {
      plannedDuration: 4,
      repairDuration: 7,
      slowdownThreshold: 85,
      failureThreshold: 100,
      wearPerCycle: { cutter: 13, lathe: 15, drill: 25, coater: 30, heatTreater: 40 },
      objective: { plannedCompletions: 1, queueReorders: 0 },
    },
    step: 0.01,
  }),
});

export const LEVEL_CONFIG = LEVELS[1];
const MAX_LEVEL_ID = Math.max(...Object.keys(LEVELS).map(Number));

export function getLevelConfig(levelId) {
  return LEVELS[levelId];
}

export function isOrderSchedulingLevel(levelOrId) {
  if (typeof levelOrId === "number") {
    return LEVELS[levelOrId]?.mode === "orderScheduling";
  }
  return levelOrId?.mode === "orderScheduling";
}

export function isMaintenanceLevel(levelOrId) {
  if (typeof levelOrId === "number") return LEVELS[levelOrId]?.maintenance != null;
  return levelOrId?.maintenance != null;
}

export function getLatheOutputLabel(level) {
  return !isOrderSchedulingLevel(level) && (level.deviceLimits?.drill ?? 0) > 0
    ? "未钻孔螺栓"
    : "螺栓";
}

export function getAllowedPaletteTypes(level) {
  if (level.paletteTypes?.length) return [...level.paletteTypes];
  return Object.keys(level.deviceLimits).filter(
    (type) => level.deviceLimits[type] > 0,
  );
}

export function getDeviceLimit(level, type) {
  return level.deviceLimits[type] ?? 0;
}

export function getTransportDuration(level, from, to) {
  return level.transportMode === "distance"
    ? 0.5 * Math.max(1, manhattanDistance(from, to))
    : 0.5;
}

export function nextUnlockedLevel(unlockedLevel, completedLevelId) {
  return Math.max(unlockedLevel, Math.min(MAX_LEVEL_ID, completedLevelId + 1));
}

const round = (value) => Math.round(value * 1000) / 1000;
const clone = (value) => structuredClone(value);

export function createEmptyDesign() {
  return { devices: {}, connections: [] };
}

export function addDevice(design, type, x, y, id = crypto.randomUUID()) {
  if (!DEVICE_TYPES[type] || design.devices[id]) return design;
  const { gridX, gridY } = snapToGrid(x, y);
  return {
    ...design,
    devices: { ...design.devices, [id]: { id, type, x, y, gridX, gridY } },
  };
}

export function moveDevice(design, id, x, y) {
  if (!design.devices[id]) return design;
  const { gridX, gridY } = snapToGrid(x, y);
  return {
    ...design,
    devices: {
      ...design.devices,
      [id]: { ...design.devices[id], x, y, gridX, gridY },
    },
  };
}

export function canPlaceDevice(design, level, cell, ignoredDeviceId = null) {
  if (isObstaclePlacement(level, cell)) return false;
  return !Object.values(design.devices).some(
    (device) =>
      device.id !== ignoredDeviceId &&
      Math.abs(device.gridX - cell.gridX) * GRID.cellSize < MACHINE.width &&
      Math.abs(device.gridY - cell.gridY) * GRID.cellSize < MACHINE.height,
  );
}

export function connectDevices(design, from, to, level = LEVEL_CONFIG) {
  const source = design.devices[from];
  const target = design.devices[to];
  if (!source || !target || from === to) return design;
  if (source.type === "exit" || target.type === "source") return design;
  if (
    design.connections.some(
      (connection) => connection.from === from && connection.to === to,
    )
  ) {
    return design;
  }
  const connectionRules = level.connectionRules ?? DEFAULT_CONNECTION_RULES;
  const allowsRecipeRouting = isOrderSchedulingLevel(level);
  if (
    !connectionRules.allowsParallelOutputs &&
    !allowsRecipeRouting &&
    design.connections.some((connection) => connection.from === from)
  ) {
    return design;
  }
  if (
    !connectionRules.allowsParallelInputs &&
    !allowsRecipeRouting &&
    design.connections.some((connection) => connection.to === to)
  ) {
    return design;
  }
  const branchIndex =
    design.connections
      .filter((connection) => connection.from === from)
      .reduce(
        (maxIndex, connection) => Math.max(maxIndex, connection.branchIndex),
        -1,
      ) + 1;
  return {
    ...design,
    connections: [
      ...design.connections,
      { id: `${from}->${to}`, from, to, branchIndex },
    ],
  };
}

export function removeConnection(design, connectionId) {
  const connections = design.connections.filter(
    (connection) => connection.id !== connectionId,
  );
  return connections.length === design.connections.length
    ? design
    : { ...design, connections };
}

export function createProductionState(design, level, scenario) {
  const sources = {};
  const machines = {};
  for (const device of Object.values(design.devices)) {
    if (device.type === "source") {
      sources[device.id] = { elapsed: 0, output: null, pulse: 0 };
    }
    if (PROCESSING_TYPES.has(device.type)) {
      machines[device.id] = {
        status: "idle",
        active: null,
        remaining: 0,
        waiting: null,
        output: null,
        warning: null,
        ...(isMaintenanceLevel(level)
          ? { totalDuration: 0, reliability: createMachineReliability() }
          : {}),
      };
    }
  }
  const lines = Object.fromEntries(
    design.connections.map((connection) => [
      connection.id,
      { ...connection, item: null },
    ]),
  );
  const baseState = {
    mode: "design",
    elapsed: 0,
    completed: 0,
    sources,
    machines,
    routingCursor: Object.fromEntries(
      [...Object.keys(sources), ...Object.keys(machines)].map((id) => [id, 0]),
    ),
    lines,
    warning: null,
    ...(isMaintenanceLevel(level) ? { maintenance: createMaintenanceState() } : {}),
  };
  if (!isOrderSchedulingLevel(level)) return baseState;

  return {
    ...baseState,
    orders: clone(scenario?.orders ?? []),
    queue: [...(scenario?.queue ?? [])],
    completedOrderIds: [],
    failure: null,
    scenarioSeed: scenario?.seed ?? null,
    scenarioLevelId: scenario?.levelId ?? level.id,
  };
}

function asOrderScenario(state) {
  return {
    levelId: state.scenarioLevelId,
    seed: state.scenarioSeed,
    orders: state.orders,
    queue: state.queue,
  };
}

export function enqueueProductionOrder(state, orderId) {
  if (!state.orders || !state.queue) return state;
  const scenario = asOrderScenario(state);
  const nextScenario = enqueueWaitingOrder(scenario, orderId);
  return nextScenario === scenario
    ? state
    : { ...state, orders: nextScenario.orders, queue: nextScenario.queue };
}

export function moveProductionOrder(state, orderId, nextIndex) {
  if (!Number.isFinite(nextIndex) || !Number.isInteger(nextIndex)) return state;
  if (!state.orders || !state.queue) return state;
  const order = state.orders.find((candidate) => candidate.id === orderId);
  if (order?.status !== "queued") return state;
  const scenario = asOrderScenario(state);
  const nextScenario = moveQueuedOrder(scenario, orderId, nextIndex);
  return nextScenario === scenario ? state : { ...state, queue: nextScenario.queue };
}

const SCENARIO_VALIDATION_POSITIONS = Object.freeze({
  source: [1, 6],
  exit: [16, 2],
  "cutter-1": [6, 6],
  "cutter-2": [1, 2],
  "lathe-1": [11, 6],
  "lathe-2": [6, 2],
  "drill-1": [11, 2],
  "drill-2": [16, 6],
  "coater-1": [11, 10],
  "heatTreater-1": [16, 10],
});

const MAX_RANDOM_SCENARIO_ATTEMPTS = 64;
const MAX_SAFE_SCENARIO_ATTEMPTS = 16;
const scenarioCache = new Map();

export function createScenarioValidationDesign(level) {
  let design = createEmptyDesign();
  const machineIds = { cutter: [], lathe: [], drill: [], coater: [], heatTreater: [] };
  for (const [id, type] of [["source", "source"], ["exit", "exit"]]) {
    const [gridX, gridY] = SCENARIO_VALIDATION_POSITIONS[id];
    design = addDevice(design, type, gridX * GRID.cellSize, gridY * GRID.cellSize, id);
  }
  for (const type of Object.keys(machineIds)) {
    for (let index = 0; index < (level.deviceLimits[type] ?? 0); index += 1) {
      const id = `${type}-${index + 1}`;
      const [gridX, gridY] = SCENARIO_VALIDATION_POSITIONS[id];
      machineIds[type].push(id);
      design = addDevice(
        design,
        type,
        gridX * GRID.cellSize,
        gridY * GRID.cellSize,
        id,
      );
    }
  }
  for (const cutterId of machineIds.cutter) {
    design = connectDevices(design, "source", cutterId, level);
  }
  for (const [index, cutterId] of machineIds.cutter.entries()) {
    design = connectDevices(
      design,
      cutterId,
      machineIds.lathe[index % machineIds.lathe.length],
      level,
    );
  }
  for (const latheId of machineIds.lathe) {
    design = connectDevices(design, latheId, "exit", level);
    for (const drillId of machineIds.drill) {
      design = connectDevices(design, latheId, drillId, level);
    }
    for (const coaterId of machineIds.coater) {
      design = connectDevices(design, latheId, coaterId, level);
    }
    for (const heatTreaterId of machineIds.heatTreater) {
      design = connectDevices(design, latheId, heatTreaterId, level);
    }
  }
  for (const drillId of machineIds.drill) {
    design = connectDevices(design, drillId, "exit", level);
  }
  for (const coaterId of machineIds.coater) {
    design = connectDevices(design, coaterId, "exit", level);
  }
  for (const heatTreaterId of machineIds.heatTreater) {
    design = connectDevices(design, heatTreaterId, "exit", level);
  }
  return design;
}

function enqueueScenarioOrdersByDeadline(state) {
  let next = state;
  const waiting = next.orders
    .filter((order) => order.status === "waiting")
    .sort((left, right) => left.deadlineAt - right.deadlineAt);
  for (const order of waiting) {
    next = enqueueProductionOrder(next, order.id);
  }
  const deadlineOrder = next.queue
    .map((orderId) => next.orders.find((order) => order.id === orderId))
    .sort((left, right) => left.deadlineAt - right.deadlineAt);
  for (const [index, order] of deadlineOrder.entries()) {
    next = moveProductionOrder(next, order.id, index);
  }
  return { ...next, queue: [...next.queue] };
}

function scheduleScenarioMaintenance(state, design, level) {
  let next = state;
  for (const [machineId, machine] of Object.entries(next.machines)) {
    if (machine.reliability?.status !== "available") continue;
    const view = getReliabilityView(
      machine,
      design.devices[machineId]?.type,
      level,
    );
    if (view.band === "warning" && view.remainingCycles <= 1) {
      next = requestMaintenance(next, machineId, level);
    }
  }

  const orderedJobs = [...(next.maintenance?.queue ?? [])].sort((left, right) => {
    const leftRemaining = getReliabilityView(
      next.machines[left.machineId],
      design.devices[left.machineId]?.type,
      level,
    ).remainingCycles;
    const rightRemaining = getReliabilityView(
      next.machines[right.machineId],
      design.devices[right.machineId]?.type,
      level,
    ).remainingCycles;
    return leftRemaining - rightRemaining || left.machineId.localeCompare(right.machineId);
  });
  for (const [index, job] of orderedJobs.entries()) {
    next = moveMaintenanceRequest(next, job.machineId, index);
  }
  return next;
}

function scenarioCompletesWithSupportedSchedule(level, scenario) {
  const design = createScenarioValidationDesign(level);
  let state = createProductionState(design, level, scenario);
  state.mode = "running";
  while (state.mode === "running" && state.elapsed < level.duration) {
    tickOrderScheduling(state, design, level, level.step);
    state = enqueueScenarioOrdersByDeadline(state);
    state = scheduleScenarioMaintenance(state, design, level);
  }
  return state.mode === "success" && state.completed === scenario.orders.length;
}

export function createOrderScenario(levelId, seed) {
  const level = LEVELS[levelId];
  if (!isOrderSchedulingLevel(level)) {
    throw new RangeError(`No order scheduling rule for level ${levelId}.`);
  }
  const cacheKey = `${levelId}:${typeof seed}:${String(seed)}`;
  const cached = scenarioCache.get(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt < MAX_RANDOM_SCENARIO_ATTEMPTS; attempt += 1) {
    const candidate = createOrderScenarioCandidate(levelId, seed, attempt);
    if (scenarioCompletesWithSupportedSchedule(level, candidate)) {
      scenarioCache.set(cacheKey, candidate);
      return candidate;
    }
  }
  for (let attempt = 0; attempt < MAX_SAFE_SCENARIO_ATTEMPTS; attempt += 1) {
    const candidate = createSafeOrderScenarioCandidate(
      levelId,
      seed,
      `${seed}:attempt:${attempt}`,
    );
    if (scenarioCompletesWithSupportedSchedule(level, candidate)) {
      scenarioCache.set(cacheKey, candidate);
      return candidate;
    }
  }

  const fallback = createSafeOrderScenarioCandidate(
    levelId,
    seed,
    `verified-fallback:${levelId}`,
  );
  if (!scenarioCompletesWithSupportedSchedule(level, fallback)) {
    throw new Error(`No feasible order scenario fallback for level ${levelId}.`);
  }
  scenarioCache.set(cacheKey, fallback);
  return fallback;
}

export function startProduction(state, options = {}) {
  if (isOrderSchedulingLevel(options.level)) {
    if (!Array.isArray(state.orders)) {
      return createProductionState(
        options.design ?? { devices: {}, connections: [] },
        options.level,
      );
    }
    if (["success", "failure"].includes(state.mode)) return state;
    if (!options.edited) return { ...state, mode: "running" };
    const freshScenario = createOrderScenario(
      options.level.id,
      state.scenarioSeed,
    );
    return {
      ...createProductionState(
        options.design ?? { devices: {}, connections: [] },
        options.level,
        freshScenario,
      ),
      mode: "running",
    };
  }
  if (options.edited) {
    return {
      ...createProductionState(
        options.design ?? { devices: {}, connections: [] },
        options.level,
      ),
      mode: "running",
    };
  }
  if (["success", "failure"].includes(state.mode)) return state;
  return { ...state, mode: "running" };
}

export function pauseProduction(state) {
  return state.mode === "running" ? { ...state, mode: "paused" } : state;
}

export function outgoing(design, deviceId) {
  return design.connections
    .filter((connection) => connection.from === deviceId)
    .sort((a, b) => a.branchIndex - b.branchIndex);
}

function selectOutgoingLine(state, design, deviceId, material = null) {
  const allConnections = outgoing(design, deviceId);
  const product = material?.productId ? PRODUCTS[material.productId] : null;
  const expectedType = product?.route[material.recipeStepIndex];
  const matchingConnections = expectedType
    ? allConnections.filter(
        (connection) => design.devices[connection.to]?.type === expectedType,
      )
    : [];
  const connections = matchingConnections.length
    ? matchingConnections
    : allConnections;
  if (connections.length === 0) return null;
  const cursor = state.routingCursor[deviceId] ?? 0;
  const connection = connections[cursor % connections.length];
  const line = state.lines[connection.id];
  return line && !line.item ? connection : null;
}

function beginMachineWork(machine, material, deviceType, level) {
  if (!canMachineAcceptMaterial(machine) || machine.active || machine.output) return false;
  machine.active = material;
  const duration = getProcessingDuration(
    machine,
    level.machineDurations[deviceType] ?? DEVICE_TYPES[deviceType].duration,
    level,
  );
  machine.remaining = duration;
  if (machine.reliability) machine.totalDuration = duration;
  machine.status = "working";
  return true;
}

function maintenanceObjectiveSatisfied(state, level) {
  const objective = level.maintenance?.objective;
  if (!objective) return true;
  return (state.maintenance?.plannedCompleted ?? 0) >= objective.plannedCompletions
    && (state.maintenance?.queueReorders ?? 0) >= objective.queueReorders;
}

function productionTargetSatisfied(state, level) {
  return isOrderSchedulingLevel(level)
    ? state.orders?.length > 0 && state.orders.every((order) => order.status === "completed")
    : state.completed >= level.target;
}

function settleSuccessfulProduction(state, level) {
  if (productionTargetSatisfied(state, level) && maintenanceObjectiveSatisfied(state, level)) {
    state.mode = "success";
  }
}

function deliverToTarget(state, design, level, line) {
  const item = line.item;
  const device = design.devices[line.to];
  if (!item || !device) return false;
  if (isOrderSchedulingLevel(level)) {
    return deliverOrderMaterial(state, design, level, line, item, device);
  }
  const spec = DEVICE_TYPES[device.type];

  if (device.type === "exit" && item.kind === "undrilledBolt") {
    line.item = null;
    state.warning = "缺少孔位";
    return true;
  }

  if (spec.accepts !== item.kind) {
    item.status = "blocked";
    const material = MATERIALS[item.kind]?.label ?? "该物料";
    const warning =
      device.type === "lathe" && item.kind === "rod"
        ? "车削机不能加工长钢棒，需要先完成切割工序。"
        : `${spec.label}不能接收${material}，请检查工序顺序。`;
    state.warning = warning;
    if (state.machines[device.id]) {
      state.machines[device.id].warning = warning;
      state.machines[device.id].status = "warning";
    }
    return false;
  }

  if (device.type === "exit") {
    state.completed = Math.min(level.target, state.completed + 1);
    line.item = null;
    settleSuccessfulProduction(state, level);
    return true;
  }

  const machine = state.machines[device.id];
  if (beginMachineWork(machine, item.kind, device.type, level)) {
    line.item = null;
    return true;
  }
  if (!canMachineAcceptMaterial(machine)) {
    item.status = "waiting";
    return false;
  }
  if (!machine.waiting) {
    machine.waiting = item.kind;
    line.item = null;
    return true;
  }
  item.status = "waiting";
  return false;
}

function trySend(state, design, level, deviceId, material, clearOutput) {
  const connection = selectOutgoingLine(state, design, deviceId, material);
  if (!connection) return false;
  const line = state.lines[connection.id];
  line.item = {
    ...(typeof material === "string" ? { kind: material } : material),
    progress: 0,
    status: "moving",
    transportDuration: getTransportDuration(
      level,
      design.devices[connection.from],
      design.devices[connection.to],
    ),
  };
  clearOutput();
  const connections = outgoing(design, deviceId);
  state.routingCursor[deviceId] =
    ((state.routingCursor[deviceId] ?? 0) + 1) % connections.length;
  return true;
}

function outputFor(level, design, type) {
  const requiresDrilling =
    (level.deviceLimits.drill ?? 0) > 0 ||
    Object.values(design.devices).some((device) => device.type === "drill");
  return type === "lathe" && requiresDrilling
    ? "undrilledBolt"
    : DEVICE_TYPES[type].produces;
}

function orderMaterial(item) {
  return {
    kind: item.kind,
    orderId: item.orderId,
    productId: item.productId,
    recipeStepIndex: item.recipeStepIndex,
  };
}

function orderMaterialOutput(type) {
  return {
    cutter: "blank",
    lathe: "bolt",
    drill: "bolt",
    coater: "coatedBolt",
    heatTreater: "hardenedBolt",
  }[type];
}

function updateOrderStatus(state, orderId, status) {
  state.orders = state.orders.map((order) =>
    order.id === orderId ? { ...order, status } : order,
  );
}

function orderRouteContext(state, item) {
  const order = state.orders.find((candidate) => candidate.id === item.orderId);
  const product = PRODUCTS[order?.productId ?? item.productId];
  return {
    order,
    product,
    expectedType: product?.route[item.recipeStepIndex],
    validIdentity:
      Boolean(order && product) &&
      order.productId === item.productId &&
      order.status === "inProduction",
  };
}

function rejectOrderMaterial(state, line, item, device, context) {
  item.status = "blocked";
  const productLabel = context.product?.label ?? item.productId ?? "未知产品";
  const expectedLabel = DEVICE_TYPES[context.expectedType]?.label ?? "正确工序";
  const warning = `订单 ${item.orderId}（${productLabel}）下一工序应为${expectedLabel}，${DEVICE_TYPES[device.type].label}无法接收。`;
  state.warning = warning;
  const machine = state.machines[device.id];
  if (machine) {
    machine.warning = warning;
    machine.status = "warning";
  }
  line.item = item;
  return false;
}

function deliverOrderMaterial(state, design, level, line, item, device) {
  const context = orderRouteContext(state, item);
  if (!context.validIdentity || context.expectedType !== device.type) {
    return rejectOrderMaterial(state, line, item, device, context);
  }

  if (device.type === "exit") {
    line.item = null;
    updateOrderStatus(state, item.orderId, "completed");
    if (!state.completedOrderIds.includes(item.orderId)) {
      state.completedOrderIds.push(item.orderId);
    }
    state.completed = state.completedOrderIds.length;
    if (
      state.orders.length > 0 &&
      state.orders.every((order) => order.status === "completed")
    ) {
      settleSuccessfulProduction(state, level);
    }
    return true;
  }

  const machine = state.machines[device.id];
  const material = orderMaterial(item);
  if (beginMachineWork(machine, material, device.type, level)) {
    line.item = null;
    return true;
  }
  if (!canMachineAcceptMaterial(machine)) {
    item.status = "waiting";
    return false;
  }
  if (!machine.waiting) {
    machine.waiting = material;
    line.item = null;
    return true;
  }
  item.status = "waiting";
  return false;
}

function activateOrders(state) {
  const scenario = asOrderScenario(state);
  const activated = activateArrivedOrders(scenario, state.elapsed);
  if (activated !== scenario) state.orders = activated.orders;
}

function tickOrderSources(state, level, delta) {
  for (const source of Object.values(state.sources)) {
    source.elapsed = round(source.elapsed + delta);
    source.pulse = Math.max(0, source.pulse - delta);
    if (source.elapsed + 1e-9 < level.sourceInterval) continue;
    source.elapsed = round(source.elapsed - level.sourceInterval);
    if (source.output || state.queue.length === 0) continue;

    const orderId = state.queue[0];
    const order = state.orders.find((candidate) => candidate.id === orderId);
    if (order?.status !== "queued" || !PRODUCTS[order.productId]) continue;
    state.queue.shift();
    updateOrderStatus(state, orderId, "inProduction");
    source.output = {
      kind: "rod",
      orderId,
      productId: order.productId,
      recipeStepIndex: 1,
    };
    source.pulse = 0.25;
  }
}

function settleOverdueOrders(state) {
  const overdue = state.orders
    .filter(
      (order) =>
        order.status !== "completed" &&
        order.status !== "overdue" &&
        state.elapsed + 1e-9 >= order.deadlineAt,
    )
    .sort((left, right) => left.deadlineAt - right.deadlineAt);
  if (overdue.length === 0) return;

  const overdueIds = new Set(overdue.map((order) => order.id));
  state.orders = state.orders.map((order) =>
    overdueIds.has(order.id) ? { ...order, status: "overdue" } : order,
  );
  const first = overdue[0];
  state.failure = {
    orderId: first.id,
    productId: first.productId,
    overdueSeconds: round(Math.max(0, state.elapsed - first.deadlineAt)),
  };
  state.mode = "failure";
}

function tickOrderScheduling(state, design, level, delta) {
  state.elapsed = round(state.elapsed + delta);
  activateOrders(state);
  tickOrderSources(state, level, delta);

  for (const line of Object.values(state.lines)) {
    if (line.item?.status === "moving") {
      line.item.progress = Math.min(
        1,
        line.item.progress + delta / line.item.transportDuration,
      );
    }
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (!machine.active) continue;
    machine.remaining = Math.max(0, machine.remaining - delta);
    if (machine.remaining > 1e-9) continue;
    machine.output = {
      ...machine.active,
      kind: orderMaterialOutput(design.devices[id].type),
      recipeStepIndex: machine.active.recipeStepIndex + 1,
    };
    machine.active = null;
    machine.remaining = 0;
    if (machine.reliability) machine.totalDuration = 0;
    machine.status = "ready";
    applyCompletedMachineCycle(state, id, design.devices[id].type, level);
  }

  for (const line of Object.values(state.lines)) {
    if (
      (line.item?.status === "moving" && line.item.progress >= 1 - 1e-9) ||
      line.item?.status === "waiting"
    ) {
      deliverToTarget(state, design, level, line);
      if (state.mode === "success") {
        advanceMaintenance(state, level, delta);
        return;
      }
    }
  }

  for (const [id, source] of Object.entries(state.sources)) {
    if (source.output) {
      trySend(state, design, level, id, source.output, () => {
        source.output = null;
      });
    }
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (machine.output) {
      trySend(state, design, level, id, machine.output, () => {
        machine.output = null;
        machine.status = "idle";
      });
    }
    if (!machine.active && !machine.output && machine.waiting) {
      if (beginMachineWork(machine, machine.waiting, design.devices[id].type, level)) {
        machine.waiting = null;
      }
    }
  }

  advanceMaintenance(state, level, delta);
  settleSuccessfulProduction(state, level);
  settleOverdueOrders(state);
  if (state.elapsed >= level.duration && state.mode === "running") {
    state.warning = productionTargetSatisfied(state, level) ? "维护目标未完成" : state.warning;
    state.mode = "failure";
  }
}

export function forecastOrderCompletionTimes(state, design, level, queue = state.queue ?? []) {
  if (!isOrderSchedulingLevel(level) || !Array.isArray(state.orders)) return new Map();

  const forecast = clone(state);
  const queuedIds = new Set(queue);
  const lastDeadline = Math.max(
    forecast.elapsed,
    ...forecast.orders.map((order) => order.deadlineAt),
  );
  const horizon = lastDeadline + level.duration;
  forecast.mode = "running";
  forecast.failure = null;
  forecast.queue = [...queue];
  forecast.orders = forecast.orders.map((order) => ({
    ...order,
    deadlineAt: horizon + 1,
    status: queuedIds.has(order.id) && order.status === "waiting" ? "queued" : order.status,
  }));

  const completionTimes = new Map(
    forecast.orders
      .filter((order) => order.status === "completed")
      .map((order) => [order.id, forecast.elapsed]),
  );
  while (forecast.elapsed < horizon && forecast.mode === "running") {
    tickOrderScheduling(forecast, design, level, level.step);
    for (const order of forecast.orders) {
      if (order.status === "completed" && !completionTimes.has(order.id)) {
        completionTimes.set(order.id, forecast.elapsed);
      }
    }
  }
  return completionTimes;
}

function tick(state, design, level, delta) {
  state.elapsed = round(state.elapsed + delta);

  for (const source of Object.values(state.sources)) {
    source.elapsed = round(source.elapsed + delta);
    source.pulse = Math.max(0, source.pulse - delta);
    if (source.elapsed + 1e-9 >= level.sourceInterval) {
      source.elapsed = round(source.elapsed - level.sourceInterval);
      if (!source.output) {
        source.output = "rod";
        source.pulse = 0.25;
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (line.item?.status === "moving") {
      line.item.progress = Math.min(
        1,
        line.item.progress + delta / line.item.transportDuration,
      );
    }
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (machine.active) {
      machine.remaining = Math.max(0, machine.remaining - delta);
      if (machine.remaining <= 1e-9) {
        machine.output = outputFor(level, design, design.devices[id].type);
        machine.active = null;
        machine.remaining = 0;
        if (machine.reliability) machine.totalDuration = 0;
        machine.status = "ready";
        applyCompletedMachineCycle(state, id, design.devices[id].type, level);
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (
      (line.item?.status === "moving" && line.item.progress >= 1 - 1e-9) ||
      line.item?.status === "waiting"
    ) {
      deliverToTarget(state, design, level, line);
      if (state.mode === "success") {
        advanceMaintenance(state, level, delta);
        return;
      }
    }
  }

  for (const [id, source] of Object.entries(state.sources)) {
    if (source.output) {
      trySend(state, design, level, id, source.output, () => {
        source.output = null;
      });
    }
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (machine.output) {
      trySend(state, design, level, id, machine.output, () => {
        machine.output = null;
        machine.status = "idle";
      });
    }
    if (!machine.active && !machine.output && machine.waiting) {
      if (beginMachineWork(machine, machine.waiting, design.devices[id].type, level)) {
        machine.waiting = null;
      }
    }
  }

  advanceMaintenance(state, level, delta);
  settleSuccessfulProduction(state, level);
  if (state.elapsed >= level.duration && state.mode !== "success") {
    state.elapsed = level.duration;
    state.warning = productionTargetSatisfied(state, level) ? "维护目标未完成" : state.warning;
    state.mode = "failure";
  }
}

export function advanceProduction(state, design, level, deltaSeconds) {
  if (typeof level === "number") {
    deltaSeconds = level;
    level = LEVEL_CONFIG;
  }
  if (state.mode !== "running" || deltaSeconds <= 0) return state;
  const next = clone(state);
  let remaining = Math.min(deltaSeconds, level.duration - next.elapsed);
  while (remaining > 1e-9 && next.mode === "running") {
    const delta = Math.min(level.step, remaining);
    if (isOrderSchedulingLevel(level)) {
      tickOrderScheduling(next, design, level, delta);
    } else {
      tick(next, design, level, delta);
    }
    remaining -= delta;
  }
  return next;
}
