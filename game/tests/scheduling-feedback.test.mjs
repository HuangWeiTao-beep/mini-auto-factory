import assert from "node:assert/strict";
import test from "node:test";

import { getSchedulingFeedback } from "../app/game/scheduling-feedback.mjs";
import {
  LEVELS,
  addDevice,
  connectDevices,
  createEmptyDesign,
  createProductionState,
} from "../app/game/factory-model.mjs";

const level = {
  sourceInterval: 1,
  transportMode: "fixed",
  machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
};

function device(id, type, gridX) {
  return { id, type, gridX, gridY: 1 };
}

function connection(id, from, to) {
  return { id, from, to };
}

test("scheduling feedback names the first missing production link for a product", () => {
  const design = {
    devices: {
      source: device("source", "source", 1),
      cutter: device("cutter", "cutter", 2),
      lathe: device("lathe", "lathe", 3),
      drill: device("drill", "drill", 4),
      exit: device("exit", "exit", 5),
    },
    connections: [
      connection("source-cutter", "source", "cutter"),
      connection("cutter-lathe", "cutter", "lathe"),
      connection("drill-exit", "drill", "exit"),
    ],
  };
  const orders = [{
    id: "L08-01",
    productId: "precision",
    deadlineAt: 24,
    status: "waiting",
  }];

  const feedback = getSchedulingFeedback({ design, level, orders, queue: [], elapsed: 0 });

  assert.deepEqual(feedback.orders[0].route, {
    status: "missing",
    missingLink: "车削机 → 钻孔机",
  });
  assert.deepEqual(feedback.recommendation, {
    kind: "route",
    orderId: "L08-01",
    message: "精密螺栓缺少连接：车削机 → 钻孔机",
  });
});

test("hardened route feedback names missing lathe-to-heat-treatment connection", () => {
  const design = {
    devices: {
      source: device("source", "source", 1),
      cutter: device("cutter", "cutter", 2),
      lathe: device("lathe", "lathe", 3),
      heat: device("heat", "heatTreater", 4),
      exit: device("exit", "exit", 5),
    },
    connections: [
      connection("source-cutter", "source", "cutter"),
      connection("cutter-lathe", "cutter", "lathe"),
      connection("heat-exit", "heat", "exit"),
    ],
  };
  const orders = [{ id: "L13-H1", productId: "hardened", deadlineAt: 30, status: "waiting" }];

  assert.equal(
    getSchedulingFeedback({ design, level, orders, queue: [], elapsed: 0 })
      .orders[0].route.missingLink,
    "车削机 → 热处理炉",
  );
});

test("hardened route feedback names missing heat-treatment-to-exit connection", () => {
  const design = {
    devices: {
      source: device("source", "source", 1),
      cutter: device("cutter", "cutter", 2),
      lathe: device("lathe", "lathe", 3),
      heat: device("heat", "heatTreater", 4),
      exit: device("exit", "exit", 5),
    },
    connections: [
      connection("source-cutter", "source", "cutter"),
      connection("cutter-lathe", "cutter", "lathe"),
      connection("lathe-heat", "lathe", "heat"),
    ],
  };
  const orders = [{ id: "L13-H2", productId: "hardened", deadlineAt: 30, status: "waiting" }];

  assert.equal(
    getSchedulingFeedback({ design, level, orders, queue: [], elapsed: 0 })
      .orders[0].route.missingLink,
    "热处理炉 → 成品出口",
  );
});

test("scheduling feedback flags a late queued order and recommends moving it to the front", () => {
  const design = {
    devices: {
      source: device("source", "source", 1),
      cutter: device("cutter", "cutter", 2),
      lathe: device("lathe", "lathe", 3),
      drill: device("drill", "drill", 4),
      exit: device("exit", "exit", 5),
    },
    connections: [
      connection("source-cutter", "source", "cutter"),
      connection("cutter-lathe", "cutter", "lathe"),
      connection("lathe-exit", "lathe", "exit"),
      connection("lathe-drill", "lathe", "drill"),
      connection("drill-exit", "drill", "exit"),
    ],
  };
  const orders = [
    { id: "L08-01", productId: "standard", deadlineAt: 30, status: "queued" },
    { id: "L08-02", productId: "precision", deadlineAt: 8, status: "queued" },
  ];

  const feedback = getSchedulingFeedback({
    design,
    level,
    orders,
    queue: ["L08-01", "L08-02"],
    elapsed: 0,
  });
  const precision = feedback.orders.find((order) => order.id === "L08-02");

  assert.equal(precision.route.status, "ready");
  assert.equal(precision.forecast.expectedAt, 11);
  assert.equal(precision.forecast.status, "late");
  assert.deepEqual(feedback.recommendation, {
    kind: "moveToFront",
    orderId: "L08-02",
    message: "精密螺栓预计超时 3.0 秒，建议提到队首。",
  });
});

test("scheduling feedback uses the live source cycle instead of a fixed full interval", () => {
  const level = { ...LEVELS[6], sourceInterval: 1 };
  let design = createEmptyDesign();
  for (const [id, type, x] of [
    ["source", "source", 1],
    ["cutter", "cutter", 2],
    ["lathe", "lathe", 3],
    ["exit", "exit", 4],
  ]) {
    design = addDevice(design, type, x * 36, 36, id);
  }
  design = connectDevices(design, "source", "cutter", level);
  design = connectDevices(design, "cutter", "lathe", level);
  design = connectDevices(design, "lathe", "exit", level);
  const orders = [{
    id: "L06-01",
    levelId: 6,
    productId: "standard",
    arrivesAt: 0,
    deadlineAt: 30,
    status: "queued",
  }];
  const slowState = createProductionState(design, level, { orders, queue: ["L06-01"] });
  slowState.mode = "running";
  const nearlyReadyState = structuredClone(slowState);
  nearlyReadyState.sources.source.elapsed = 0.9;

  const slow = getSchedulingFeedback({
    design, level, state: slowState, orders, queue: ["L06-01"], elapsed: 0,
  });
  const nearlyReady = getSchedulingFeedback({
    design, level, state: nearlyReadyState, orders, queue: ["L06-01"], elapsed: 0,
  });

  assert.ok(nearlyReady.orders[0].forecast.expectedAt < slow.orders[0].forecast.expectedAt);
});

test("a waiting order forecast models its own join-the-front action, not other waiting orders", () => {
  const level = { ...LEVELS[6], sourceInterval: 1 };
  let design = createEmptyDesign();
  for (const [id, type, x] of [
    ["source", "source", 1],
    ["cutter", "cutter", 2],
    ["lathe", "lathe", 3],
    ["exit", "exit", 4],
  ]) {
    design = addDevice(design, type, x * 36, 36, id);
  }
  design = connectDevices(design, "source", "cutter", level);
  design = connectDevices(design, "cutter", "lathe", level);
  design = connectDevices(design, "lathe", "exit", level);
  const target = {
    id: "L06-01", levelId: 6, productId: "standard", arrivesAt: 0, deadlineAt: 30, status: "waiting",
  };
  const unrelatedUrgent = {
    id: "L06-02", levelId: 6, productId: "standard", arrivesAt: 0, deadlineAt: 8, status: "waiting",
  };
  const state = createProductionState(design, level, { orders: [target, unrelatedUrgent], queue: [] });
  state.mode = "running";
  const changedDeadlineState = structuredClone(state);
  changedDeadlineState.orders[1].deadlineAt = 40;

  const withUrgentPeer = getSchedulingFeedback({
    design, level, state, orders: state.orders, queue: [], elapsed: 0,
  });
  const withRelaxedPeer = getSchedulingFeedback({
    design, level, state: changedDeadlineState, orders: changedDeadlineState.orders, queue: [], elapsed: 0,
  });

  assert.equal(
    withUrgentPeer.orders.find((order) => order.id === target.id)?.forecast.expectedAt,
    withRelaxedPeer.orders.find((order) => order.id === target.id)?.forecast.expectedAt,
  );
});
