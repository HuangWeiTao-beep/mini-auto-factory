export const DEVICE_TYPES = {
  source: { label: "钢棒源", accepts: null, produces: "rod", duration: 3 },
  cutter: { label: "切割机", accepts: "rod", produces: "blank", duration: 2 },
  lathe: { label: "车削机", accepts: "blank", produces: "bolt", duration: 3 },
  exit: { label: "成品出口", accepts: "bolt", produces: null, duration: 0 },
};

export const MATERIALS = {
  rod: { label: "长钢棒", shortLabel: "钢棒" },
  blank: { label: "短料", shortLabel: "短料" },
  bolt: { label: "螺栓", shortLabel: "螺栓" },
};

export const LEVEL_CONFIG = {
  duration: 60,
  target: 10,
  transportDuration: 0.5,
  sourceInterval: 3,
  step: 0.01,
};

const round = (value) => Math.round(value * 1000) / 1000;
const clone = (value) => structuredClone(value);

export function createEmptyDesign() {
  return { devices: {}, connections: [] };
}

export function addDevice(design, type, x, y, id = crypto.randomUUID()) {
  if (!DEVICE_TYPES[type] || design.devices[id]) return design;
  return {
    ...design,
    devices: { ...design.devices, [id]: { id, type, x, y } },
  };
}

export function moveDevice(design, id, x, y) {
  if (!design.devices[id]) return design;
  return {
    ...design,
    devices: {
      ...design.devices,
      [id]: { ...design.devices[id], x, y },
    },
  };
}

export function connectDevices(design, from, to) {
  const source = design.devices[from];
  const target = design.devices[to];
  if (!source || !target || from === to) return design;
  if (source.type === "exit" || target.type === "source") return design;
  if (design.connections.some((connection) => connection.from === from)) return design;
  if (design.connections.some((connection) => connection.to === to)) return design;
  return {
    ...design,
    connections: [
      ...design.connections,
      { id: `${from}->${to}`, from, to },
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
  const machines = {};
  for (const device of Object.values(design.devices)) {
    if (device.type === "cutter" || device.type === "lathe") {
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
    source: { elapsed: 0, output: null, pulse: 0 },
    machines,
    lines,
    warning: null,
  };
}

export function startProduction(state, options = {}) {
  if (options.edited) {
    return {
      ...createProductionState(options.design ?? { devices: {}, connections: [] }),
      mode: "running",
    };
  }
  if (["success", "failure"].includes(state.mode)) return state;
  return { ...state, mode: "running" };
}

export function pauseProduction(state) {
  return state.mode === "running" ? { ...state, mode: "paused" } : state;
}

function outgoing(design, deviceId) {
  return design.connections.find((connection) => connection.from === deviceId);
}

function deliverToTarget(state, design, line) {
  const item = line.item;
  const device = design.devices[line.to];
  if (!item || !device) return false;
  const spec = DEVICE_TYPES[device.type];

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
    if (state.completed >= LEVEL_CONFIG.target) state.mode = "success";
    return true;
  }

  const machine = state.machines[device.id];
  if (!machine.active && !machine.output) {
    machine.active = item.kind;
    machine.remaining = spec.duration;
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

function trySend(state, design, deviceId, kind, clearOutput) {
  const connection = outgoing(design, deviceId);
  if (!connection) return false;
  const line = state.lines[connection.id];
  if (!line || line.item) return false;
  line.item = { kind, progress: 0, status: "moving" };
  clearOutput();
  return true;
}

function tick(state, design, delta) {
  state.elapsed = round(state.elapsed + delta);
  state.source.elapsed = round(state.source.elapsed + delta);
  state.source.pulse = Math.max(0, state.source.pulse - delta);

  if (state.source.elapsed + 1e-9 >= LEVEL_CONFIG.sourceInterval) {
    state.source.elapsed = round(state.source.elapsed - LEVEL_CONFIG.sourceInterval);
    if (!state.source.output) {
      state.source.output = "rod";
      state.source.pulse = 0.25;
    }
  }

  for (const line of Object.values(state.lines)) {
    if (line.item?.status === "moving") {
      line.item.progress = Math.min(
        1,
        line.item.progress + delta / LEVEL_CONFIG.transportDuration,
      );
    }
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (machine.active) {
      machine.remaining = Math.max(0, machine.remaining - delta);
      if (machine.remaining <= 1e-9) {
        machine.output = DEVICE_TYPES[design.devices[id].type].produces;
        machine.active = null;
        machine.remaining = 0;
        machine.status = "ready";
      }
    }
  }

  for (const line of Object.values(state.lines)) {
    if (line.item?.status === "moving" && line.item.progress >= 1) {
      deliverToTarget(state, design, line);
      if (state.mode === "success") return;
    }
  }

  if (state.source.output) {
    trySend(state, design, findSourceId(design), state.source.output, () => {
      state.source.output = null;
    });
  }

  for (const [id, machine] of Object.entries(state.machines)) {
    if (machine.output) {
      trySend(state, design, id, machine.output, () => {
        machine.output = null;
        machine.status = "idle";
      });
    }
    if (!machine.active && !machine.output && machine.waiting) {
      machine.active = machine.waiting;
      machine.waiting = null;
      machine.remaining = DEVICE_TYPES[design.devices[id].type].duration;
      machine.status = "working";
    }
  }

  if (state.elapsed >= LEVEL_CONFIG.duration && state.mode !== "success") {
    state.elapsed = LEVEL_CONFIG.duration;
    state.mode = "failure";
  }
}

function findSourceId(design) {
  return Object.values(design.devices).find((device) => device.type === "source")?.id;
}

export function advanceProduction(state, design, deltaSeconds) {
  if (state.mode !== "running" || deltaSeconds <= 0) return state;
  const next = clone(state);
  let remaining = Math.min(deltaSeconds, LEVEL_CONFIG.duration - next.elapsed);
  while (remaining > 1e-9 && next.mode === "running") {
    const delta = Math.min(LEVEL_CONFIG.step, remaining);
    tick(next, design, delta);
    remaining -= delta;
  }
  return next;
}
