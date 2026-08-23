import assert from "node:assert/strict";
import test from "node:test";

import { getMaintenanceFeedback } from "../app/game/maintenance-feedback.mjs";
import { createProductionState } from "../app/game/factory-model.mjs";

const maintenance = {
  plannedDuration: 4,
  repairDuration: 7,
  slowdownThreshold: 85,
  failureThreshold: 100,
  wearPerCycle: { cutter: 8, lathe: 10, drill: 9, coater: 11, heatTreater: 12 },
};

const level = {
  id: 13,
  chapter: 3,
  mode: "orderScheduling",
  name: "反馈测试",
  routeHint: "测试路线",
  duration: 60,
  target: 1,
  deviceLimits: { lathe: 1, heatTreater: 1 },
  transportMode: "fixed",
  transportDuration: 0.5,
  sourceInterval: 1,
  machineDurations: { lathe: 2, heatTreater: 3 },
  connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
  paletteTypes: ["lathe", "heatTreater"],
  orderConfig: {
    orderCount: 0,
    arrivalWindow: [0, 0],
    deadlineLeadWindow: [20, 20],
    productPool: ["hardened"],
    paletteTypes: ["lathe", "heatTreater"],
  },
  maintenance,
  obstacles: [],
  step: 0.1,
};

function device(id, type, gridX) {
  return { id, type, x: gridX * 36, y: 36, gridX, gridY: 1 };
}

function feedbackState({ machineId, type, wear }) {
  const design = { devices: { [machineId]: device(machineId, type, 1) }, connections: [] };
  const state = createProductionState(design, level, { orders: [], queue: [] });
  state.machines[machineId].reliability.wear = wear;
  return { state, design, level };
}

function queuedRepairState() {
  const design = {
    devices: {
      lathe: device("lathe", "lathe", 1),
      heat: device("heat", "heatTreater", 2),
    },
    connections: [],
  };
  const state = createProductionState(design, level, { orders: [], queue: [] });
  state.machines.lathe.reliability.status = "under-maintenance";
  state.machines.heat.reliability = { wear: 100, status: "broken" };
  state.maintenance = {
    activeJob: { machineId: "lathe", kind: "planned", remaining: 2 },
    queue: [{ machineId: "heat", kind: "repair", remaining: 7 }],
  };
  return { state, design, level };
}

test("dangerous idle furnace recommends scheduling maintenance", () => {
  const input = feedbackState({ machineId: "heat", type: "heatTreater", wear: 88 });
  const before = structuredClone(input.state);

  const feedback = getMaintenanceFeedback(input);

  assert.deepEqual(feedback.recommendation, {
    kind: "scheduleMaintenance",
    machineId: "heat",
    message: "热处理炉还能加工 1 件，建议现在安排维护。",
  });
  assert.deepEqual(input.state, before);
});

test("a broken machine behind a planned job recommends repair priority", () => {
  const input = queuedRepairState();

  assert.equal(getMaintenanceFeedback(input).recommendation.kind, "prioritizeRepair");
});

test("maintenance feedback returns one wear view for each processing machine", () => {
  const input = queuedRepairState();

  const feedback = getMaintenanceFeedback(input);

  assert.deepEqual(feedback.machines.map(({ id, band, remainingCycles }) => ({
    id,
    band,
    remainingCycles,
  })), [
    { id: "heat", band: "failed", remainingCycles: 0 },
    { id: "lathe", band: "normal", remainingCycles: 10 },
  ]);
});

test("a machine type without a wear rate is not treated as one cycle from failure", () => {
  const input = feedbackState({ machineId: "heat", type: "heatTreater", wear: 0 });
  input.level = {
    ...input.level,
    maintenance: { ...input.level.maintenance, wearPerCycle: {} },
  };

  assert.deepEqual(getMaintenanceFeedback(input).recommendation, {
    kind: "stable",
    message: "维护平稳：目前没有高风险设备。",
  });
});

test("hypothetical forecasts evaluate only the first three candidates by band remaining cycles and id", () => {
  const design = {
    devices: {
      "warning-a": device("warning-a", "cutter", 1),
      "danger-c": device("danger-c", "lathe", 2),
      "danger-b": device("danger-b", "heatTreater", 3),
      "danger-a": device("danger-a", "heatTreater", 4),
    },
    connections: [],
  };
  const candidateLevel = {
    ...level,
    maintenance: {
      ...level.maintenance,
      wearPerCycle: { cutter: 16, lathe: 10, heatTreater: 12 },
    },
  };
  const state = createProductionState(design, candidateLevel, { orders: [], queue: [] });
  state.machines["warning-a"].reliability.wear = 84;
  state.machines["danger-c"].reliability.wear = 85;
  state.machines["danger-b"].reliability.wear = 88;
  state.machines["danger-a"].reliability.wear = 88;
  const forecastedMachineIds = [];
  const realStructuredClone = globalThis.structuredClone;
  globalThis.structuredClone = (value, options) => {
    const plannedJob = value?.maintenance?.queue?.find((job) => job.kind === "planned");
    if (plannedJob) forecastedMachineIds.push(plannedJob.machineId);
    return realStructuredClone(value, options);
  };

  let result;
  try {
    result = getMaintenanceFeedback({ state, design, level: candidateLevel });
  } finally {
    globalThis.structuredClone = realStructuredClone;
  }

  assert.deepEqual(result.machines.map(({ id }) => id), [
    "danger-a",
    "danger-b",
    "danger-c",
    "warning-a",
  ]);
  assert.deepEqual(forecastedMachineIds, ["danger-a", "danger-b", "danger-c"]);
});
