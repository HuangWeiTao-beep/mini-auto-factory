import assert from "node:assert/strict";
import test from "node:test";

import { getOperationsFeedback } from "../app/game/operations-feedback.mjs";
import { createProductionState } from "../app/game/factory-model.mjs";

const maintenance = {
  plannedDuration: 4,
  repairDuration: 7,
  slowdownThreshold: 85,
  failureThreshold: 100,
  wearPerCycle: { cutter: 8, lathe: 10, heatTreater: 12 },
};

const level = {
  id: 13,
  chapter: 3,
  mode: "orderScheduling",
  name: "运营反馈测试",
  routeHint: "钢棒源 → 切割机 → 车削机 → 成品出口",
  duration: 60,
  target: 2,
  deviceLimits: { source: 1, cutter: 1, lathe: 1, heatTreater: 1, exit: 1 },
  transportMode: "fixed",
  transportDuration: 0.5,
  sourceInterval: 1,
  machineDurations: { cutter: 2, lathe: 3, heatTreater: 3 },
  connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
  paletteTypes: ["source", "cutter", "lathe", "heatTreater", "exit"],
  orderConfig: {
    orderCount: 2,
    arrivalWindow: [0, 0],
    deadlineLeadWindow: [20, 20],
    productPool: ["standard"],
    paletteTypes: ["source", "cutter", "lathe", "heatTreater", "exit"],
  },
  maintenance,
  obstacles: [],
  step: 0.1,
};

function device(id, type, gridX) {
  return { id, type, x: gridX * 36, y: 36, gridX, gridY: 1 };
}

function designWithStandardRoute({ missingExit = false } = {}) {
  return {
    devices: {
      source: device("source", "source", 1),
      cutter: device("cutter", "cutter", 2),
      lathe: device("lathe", "lathe", 3),
      heat: device("heat", "heatTreater", 4),
      exit: device("exit", "exit", 5),
    },
    connections: [
      { id: "source-cutter", from: "source", to: "cutter", branchIndex: 0 },
      { id: "cutter-lathe", from: "cutter", to: "lathe", branchIndex: 0 },
      ...(missingExit ? [] : [{ id: "lathe-exit", from: "lathe", to: "exit", branchIndex: 0 }]),
    ],
  };
}

function order(id, deadlineAt, status = "queued") {
  return { id, levelId: 13, productId: "standard", arrivesAt: 0, deadlineAt, status };
}

function operationsState({ orders, queue, missingExit = false, heatWear = 0 }) {
  const design = designWithStandardRoute({ missingExit });
  const state = createProductionState(design, level, { orders, queue });
  state.machines.heat.reliability.wear = heatWear;
  return { design, state };
}

function feedback(input) {
  return getOperationsFeedback({
    design: input.design,
    level,
    state: input.state,
    orders: input.state.orders,
    queue: input.state.queue,
    elapsed: input.state.elapsed,
  });
}

test("a missing route outranks a broken machine", () => {
  const input = operationsState({
    orders: [order("L13-01", 20, "waiting")],
    queue: [],
    missingExit: true,
  });
  input.state.machines.heat.reliability = { wear: 100, status: "broken" };
  input.state.maintenance.queue.push({ machineId: "heat", kind: "repair", remaining: 7 });

  assert.deepEqual(feedback(input).recommendation, {
    kind: "route",
    message: "普通螺栓缺少连接：车削机 → 成品出口",
  });
});

test("repair priority outranks a late queued order action", () => {
  const orders = [order("L13-01", 30), order("L13-02", 2)];
  const input = operationsState({ orders, queue: orders.map(({ id }) => id) });
  input.state.machines.heat.reliability = { wear: 100, status: "broken" };
  input.state.maintenance.queue.push({ machineId: "heat", kind: "repair", remaining: 7 });

  assert.equal(feedback(input).recommendation.kind, "prioritizeRepair");
  assert.equal(feedback(input).recommendation.machineId, "heat");
});

test("a late order action outranks dangerous maintenance", () => {
  const orders = [order("L13-01", 30), order("L13-02", 2)];
  const input = operationsState({ orders, queue: orders.map(({ id }) => id), heatWear: 88 });

  assert.deepEqual(feedback(input).recommendation, {
    kind: "moveToFront",
    orderId: "L13-02",
    message: "普通螺栓预计超时 8.5 秒，建议提到队首。",
  });
});

test("dangerous maintenance outranks stable scheduling", () => {
  const input = operationsState({ orders: [], queue: [], heatWear: 88 });

  assert.deepEqual(feedback(input).recommendation, {
    kind: "scheduleMaintenance",
    machineId: "heat",
    message: "热处理炉还能加工 1 件，建议现在安排维护。",
  });
});

for (const maintenanceStatus of ["maintenance-pending", "under-maintenance"]) {
  test(`passive ${maintenanceStatus} danger does not hide a scheduling monitor`, () => {
    const orders = [order("L13-01", 20)];
    const input = operationsState({ orders, queue: ["L13-01"] });
    input.state.machines.lathe.reliability = { wear: 88, status: maintenanceStatus };
    if (maintenanceStatus === "under-maintenance") {
      input.state.maintenance.activeJob = {
        machineId: "lathe",
        kind: "planned",
        remaining: 1_000,
      };
    } else {
      input.state.maintenance.queue.push({
        machineId: "lathe",
        kind: "planned",
        remaining: 1_000,
      });
    }

    const result = feedback(input);

    assert.equal(result.maintenance.recommendation.kind, "stable");
    assert.equal(result.scheduling.recommendation.kind, "monitor");
    assert.deepEqual(result.recommendation, {
      kind: "monitor",
      message: "普通螺栓预测受阻，请检查下游连接与等待位。",
    });
  });
}

test("a passive maintenance monitor is kept after stable scheduling", () => {
  const orders = [order("L13-01", 11)];
  const input = operationsState({ orders, queue: ["L13-01"] });
  input.state.machines.cutter.reliability.wear = 88;

  const result = feedback(input);

  assert.equal(result.scheduling.recommendation.kind, "stable");
  assert.equal(result.maintenance.recommendation.kind, "monitor");
  assert.deepEqual(result.recommendation, {
    kind: "monitor",
    message: "切割机还能加工 2 件，但订单 L13-01 交付紧张，建议订单完成后维护。",
  });
});

test("stable operations feedback omits action identifiers", () => {
  const input = operationsState({ orders: [], queue: [] });

  assert.deepEqual(feedback(input).recommendation, {
    kind: "stable",
    message: "运营平稳：目前没有高风险订单或设备。",
  });
});
