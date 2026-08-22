import {
  GRID,
  MACHINE,
  isObstaclePlacement,
  manhattanDistance,
  snapToGrid,
} from "./factory-grid.mjs";
import { ORDER_SCENARIO_RULES } from "./order-scheduling.mjs";

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
  exit: createDeviceSpec("成品出口", "bolt", null, 0, "✓", "EXIT 99"),
});

export const PROCESSING_TYPES = new Set(["cutter", "lathe", "drill", "coater"]);

export const MATERIALS = Object.freeze({
  rod: { label: "长钢棒", shortLabel: "钢棒" },
  blank: { label: "短料", shortLabel: "短料" },
  bolt: { label: "螺栓", shortLabel: "螺栓" },
  undrilledBolt: { label: "未钻孔螺栓", shortLabel: "未钻孔" },
  coatedBolt: { label: "防锈螺栓", shortLabel: "防锈" },
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
    connectionRules: DEFAULT_CONNECTION_RULES,
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
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, coater: 1, exit: 1 },
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
    deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, coater: 2, exit: 1 },
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
  if (
    !connectionRules.allowsParallelOutputs &&
    design.connections.some((connection) => connection.from === from)
  ) {
    return design;
  }
  if (
    !connectionRules.allowsParallelInputs &&
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

export function createProductionState(design) {
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
      };
    }
  }
  const lines = Object.fromEntries(
    design.connections.map((connection) => [
      connection.id,
      { ...connection, item: null },
    ]),
  );
  return {
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
  };
}

export function startProduction(state, options = {}) {
  if (options.edited) {
    return {
      ...createProductionState(
        options.design ?? { devices: {}, connections: [] },
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

function selectOutgoingLine(state, design, deviceId) {
  const connections = outgoing(design, deviceId);
  if (connections.length === 0) return null;
  const cursor = state.routingCursor[deviceId] ?? 0;
  const connection = connections[cursor % connections.length];
  const line = state.lines[connection.id];
  return line && !line.item ? connection : null;
}

function deliverToTarget(state, design, level, line) {
  const item = line.item;
  const device = design.devices[line.to];
  if (!item || !device) return false;
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
    state.completed += 1;
    line.item = null;
    if (state.completed >= level.target) state.mode = "success";
    return true;
  }

  const machine = state.machines[device.id];
  if (!machine.active && !machine.output) {
    machine.active = item.kind;
    machine.remaining = level.machineDurations[device.type];
    machine.status = "working";
    line.item = null;
    return true;
  }
  if (!machine.waiting) {
    machine.waiting = item.kind;
    line.item = null;
    return true;
  }
  item.status = "waiting";
  return false;
}

function trySend(state, design, level, deviceId, kind, clearOutput) {
  const connection = selectOutgoingLine(state, design, deviceId);
  if (!connection) return false;
  const line = state.lines[connection.id];
  line.item = {
    kind,
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

function outputFor(level, type) {
  return type === "lathe" && level.id >= 2
    ? "undrilledBolt"
    : DEVICE_TYPES[type].produces;
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
        machine.output = outputFor(level, design.devices[id].type);
        machine.active = null;
        machine.remaining = 0;
        machine.status = "ready";
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (
      (line.item?.status === "moving" && line.item.progress >= 1 - 1e-9) ||
      line.item?.status === "waiting"
    ) {
      deliverToTarget(state, design, level, line);
      if (state.mode === "success") return;
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
      machine.active = machine.waiting;
      machine.waiting = null;
      machine.remaining = level.machineDurations[design.devices[id].type];
      machine.status = "working";
    }
  }

  if (state.elapsed >= level.duration && state.mode !== "success") {
    state.elapsed = level.duration;
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
    tick(next, design, level, delta);
    remaining -= delta;
  }
  return next;
}
