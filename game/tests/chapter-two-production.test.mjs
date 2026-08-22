import assert from "node:assert/strict";
import test from "node:test";

import {
  LEVELS,
  addDevice,
  advanceProduction,
  canPlaceDevice,
  connectDevices,
  createEmptyDesign,
  createProductionState,
  enqueueProductionOrder,
  getTransportDuration,
  moveProductionOrder,
  pauseProduction,
  startProduction,
} from "../app/game/factory-model.mjs";
import { createOrderScenario } from "../app/game/order-scheduling.mjs";
import { getFailureDiagnostic } from "../app/game/feedback-policy.mjs";

const FIXED_LEVEL_SEEDS = Object.freeze({
  6: 1606,
  7: 1707,
  8: 1808,
  9: 1909,
  10: 2010,
});

function createScenario(levelId, orders, seed = `test-${levelId}`) {
  return {
    levelId,
    seed,
    paletteTypes: LEVELS[levelId].paletteTypes,
    orders: orders.map((order, index) => ({
      id: order.id ?? `L${levelId}-T${index + 1}`,
      levelId,
      productId: order.productId,
      arrivesAt: order.arrivesAt ?? 0,
      deadlineAt: order.deadlineAt ?? 60,
      status: order.status ?? "waiting",
    })),
    queue: [],
  };
}

function addNamedDevice(design, id, type) {
  return addDevice(design, type, 36, 72, id);
}

const LEGAL_RECIPE_POSITIONS = Object.freeze({
  source: [1, 6],
  exit: [16, 2],
  "cutter-1": [6, 6],
  "cutter-2": [1, 2],
  "lathe-1": [11, 6],
  "lathe-2": [6, 2],
  "drill-1": [11, 2],
  "drill-2": [16, 6],
  "coater-1": [11, 10],
  "coater-2": [16, 10],
});

function addLegalRecipeDevice(design, level, id, type) {
  const [gridX, gridY] = LEGAL_RECIPE_POSITIONS[id];
  assert.equal(
    canPlaceDevice(design, level, { gridX, gridY }),
    true,
    `level ${level.id}: ${id} must be legally placeable at ${gridX},${gridY}`,
  );
  return addDevice(design, type, gridX * 36, gridY * 36, id);
}

function assertRecipeDesignIsLegal(design, level) {
  let placed = createEmptyDesign();
  for (const device of Object.values(design.devices)) {
    assert.equal(device.gridX >= 1 && device.gridX <= 16, true);
    assert.equal(device.gridY >= 2 && device.gridY <= 10, true);
    assert.equal(
      canPlaceDevice(placed, level, device),
      true,
      `level ${level.id}: ${device.id} overlaps a device or obstacle`,
    );
    placed = addDevice(placed, device.type, device.x, device.y, device.id);
  }
  if (level.transportMode === "distance") {
    for (const connection of design.connections) {
      assert.ok(
        getTransportDuration(
          level,
          design.devices[connection.from],
          design.devices[connection.to],
        ) >= 2,
        `level ${level.id}: ${connection.id} must retain grid-distance transport`,
      );
    }
  }
}

function createRecipeDesign(level) {
  let design = createEmptyDesign();
  design = addLegalRecipeDevice(design, level, "source", "source");
  design = addLegalRecipeDevice(design, level, "exit", "exit");

  const cutterIds = [];
  const latheIds = [];
  const drillIds = [];
  const coaterIds = [];
  for (let machineIndex = 0; machineIndex < (level.deviceLimits.cutter ?? 0); machineIndex += 1) {
    const id = `cutter-${machineIndex + 1}`;
    cutterIds.push(id);
    design = addLegalRecipeDevice(design, level, id, "cutter");
  }
  for (let machineIndex = 0; machineIndex < (level.deviceLimits.lathe ?? 0); machineIndex += 1) {
    const id = `lathe-${machineIndex + 1}`;
    latheIds.push(id);
    design = addLegalRecipeDevice(design, level, id, "lathe");
  }
  for (let machineIndex = 0; machineIndex < (level.deviceLimits.drill ?? 0); machineIndex += 1) {
    const id = `drill-${machineIndex + 1}`;
    drillIds.push(id);
    design = addLegalRecipeDevice(design, level, id, "drill");
  }
  for (let machineIndex = 0; machineIndex < (level.deviceLimits.coater ?? 0); machineIndex += 1) {
    const id = `coater-${machineIndex + 1}`;
    coaterIds.push(id);
    design = addLegalRecipeDevice(design, level, id, "coater");
  }

  for (const cutterId of cutterIds) {
    design = connectDevices(design, "source", cutterId, level);
  }
  for (const [machineIndex, cutterId] of cutterIds.entries()) {
    design = connectDevices(
      design,
      cutterId,
      latheIds[machineIndex % latheIds.length],
      level,
    );
  }
  for (const latheId of latheIds) {
    design = connectDevices(design, latheId, "exit", level);
    for (const drillId of drillIds) {
      design = connectDevices(design, latheId, drillId, level);
    }
    for (const coaterId of coaterIds) {
      design = connectDevices(design, latheId, coaterId, level);
    }
  }
  for (const drillId of drillIds) {
    design = connectDevices(design, drillId, "exit", level);
  }
  for (const coaterId of coaterIds) {
    design = connectDevices(design, coaterId, "exit", level);
  }
  return design;
}

function startScenario(design, level, scenario) {
  return startProduction(createProductionState(design, level, scenario), {
    edited: false,
    design,
    level,
  });
}

function enqueueAllWaitingByDeadline(state) {
  const waiting = state.orders
    .filter((order) => order.status === "waiting")
    .sort((left, right) => left.deadlineAt - right.deadlineAt);
  let next = state;
  for (const order of waiting) next = enqueueProductionOrder(next, order.id);
  const desiredQueue = next.queue
    .map((orderId) => next.orders.find((order) => order.id === orderId))
    .sort((left, right) => left.deadlineAt - right.deadlineAt);
  for (const [nextIndex, order] of desiredQueue.entries()) {
    next = moveProductionOrder(next, order.id, nextIndex);
  }
  return next;
}

function simulateScheduledScenario(design, level, scenario, queueStrategy = enqueueAllWaitingByDeadline) {
  let state = startScenario(design, level, scenario);
  while (state.mode === "running" && state.elapsed < level.duration) {
    state = advanceProduction(state, design, level, level.step);
    state = queueStrategy(state);
  }
  return state;
}

test("chapter-two state copies scenario identity and order runtime fields", () => {
  const scenario = createScenario(6, [
    { id: "order-a", productId: "standard", status: "scheduled" },
  ], 1606);
  const state = createProductionState(createRecipeDesign(LEVELS[6]), LEVELS[6], scenario);

  assert.deepEqual(state.orders, scenario.orders);
  assert.notEqual(state.orders, scenario.orders);
  assert.deepEqual(state.queue, []);
  assert.deepEqual(state.completedOrderIds, []);
  assert.equal(state.failure, null);
  assert.equal(state.scenarioSeed, 1606);
  assert.equal(state.scenarioLevelId, 6);
});

test("an empty order queue keeps the source idle, then only its head is launched", () => {
  const level = LEVELS[6];
  const design = createRecipeDesign(level);
  const scenario = createScenario(6, [
    { id: "order-a", productId: "standard", status: "scheduled" },
    { id: "order-b", productId: "precision", status: "scheduled" },
  ]);
  let state = startScenario(design, level, scenario);

  state = advanceProduction(state, design, level, level.sourceInterval);
  assert.equal(state.sources.source.output, null);
  assert.equal(Object.values(state.lines).every((line) => line.item === null), true);

  state = enqueueProductionOrder(state, "order-a");
  state = enqueueProductionOrder(state, "order-b");
  state = moveProductionOrder(state, "order-b", 0);
  state = advanceProduction(state, design, level, level.sourceInterval);

  assert.deepEqual(state.queue, ["order-a"]);
  assert.equal(state.orders.find((order) => order.id === "order-b").status, "inProduction");
  assert.equal(state.orders.find((order) => order.id === "order-a").status, "queued");
  const launched = Object.values(state.lines).find((line) => line.item)?.item;
  assert.deepEqual(
    {
      orderId: launched.orderId,
      productId: launched.productId,
      recipeStepIndex: launched.recipeStepIndex,
      kind: launched.kind,
    },
    { orderId: "order-b", productId: "precision", recipeStepIndex: 1, kind: "rod" },
  );
});

test("queue APIs reject every transition except waiting to queued and queued reordering", () => {
  const level = LEVELS[6];
  const design = createRecipeDesign(level);
  const statuses = ["scheduled", "waiting", "queued", "inProduction", "completed", "overdue"];
  const scenario = createScenario(
    6,
    statuses.map((status) => ({ id: status, productId: "standard", status })),
  );
  scenario.queue = ["queued"];
  const state = createProductionState(design, level, scenario);

  for (const status of statuses.filter((candidate) => candidate !== "waiting")) {
    assert.equal(enqueueProductionOrder(state, status), state);
  }
  const queued = enqueueProductionOrder(state, "waiting");
  assert.equal(queued.orders.find((order) => order.id === "waiting").status, "queued");
  assert.deepEqual(queued.queue, ["queued", "waiting"]);
  for (const status of statuses.filter((candidate) => candidate !== "queued")) {
    assert.equal(moveProductionOrder(state, status, 0), state);
  }
  assert.equal(moveProductionOrder(state, "queued", 0), state);
});

for (const [productId, levelId, finalMachine] of [
  ["standard", 6, "lathe"],
  ["precision", 6, "drill"],
  ["rustproof", 8, "coater"],
]) {
  test(`${productId} completes only after its ${finalMachine} recipe route`, () => {
    const level = LEVELS[levelId];
    const design = createRecipeDesign(level);
    const scenario = createScenario(levelId, [
      { id: `order-${productId}`, productId, deadlineAt: 60 },
    ]);
    let state = startScenario(design, level, scenario);
    state = enqueueProductionOrder(state, `order-${productId}`);
    state = advanceProduction(state, design, level, 30);

    assert.equal(state.mode, "success");
    assert.equal(state.completed, 1);
    assert.deepEqual(state.completedOrderIds, [`order-${productId}`]);
    assert.equal(state.orders[0].status, "completed");
  });
}

test("a rustproof order bypassing coating is rejected with the expected next operation", () => {
  const level = LEVELS[8];
  let design = createEmptyDesign();
  for (const [index, type] of ["source", "cutter", "lathe", "exit"].entries()) {
    design = addNamedDevice(design, type, type, index);
  }
  design = connectDevices(design, "source", "cutter", level);
  design = connectDevices(design, "cutter", "lathe", level);
  design = connectDevices(design, "lathe", "exit", level);
  const scenario = createScenario(8, [
    { id: "rust-order", productId: "rustproof", deadlineAt: 60 },
  ]);
  let state = enqueueProductionOrder(startScenario(design, level, scenario), "rust-order");

  state = advanceProduction(state, design, level, 20);

  assert.equal(state.completed, 0);
  assert.equal(state.orders[0].status, "inProduction");
  assert.match(state.warning, /rust-order/);
  assert.match(state.warning, /镀层机/);
  assert.equal(state.lines["lathe->exit"].item.status, "blocked");
});

test("a product identity mismatch is not delivered and reports the real order's next step", () => {
  const level = LEVELS[6];
  let design = createEmptyDesign();
  design = addNamedDevice(design, "lathe", "lathe", 0);
  design = addNamedDevice(design, "exit", "exit", 1);
  design = connectDevices(design, "lathe", "exit", level);
  const scenario = createScenario(6, [
    { id: "precision-order", productId: "precision", status: "inProduction", deadlineAt: 20 },
  ]);
  const state = createProductionState(design, level, scenario);
  state.mode = "running";
  state.elapsed = 5;
  state.lines["lathe->exit"].item = {
    kind: "bolt",
    orderId: "precision-order",
    productId: "standard",
    recipeStepIndex: 3,
    progress: 1,
    status: "moving",
    transportDuration: 0.5,
  };

  const rejected = advanceProduction(state, design, level, level.step);

  assert.equal(rejected.completed, 0);
  assert.match(rejected.warning, /precision-order/);
  assert.match(rejected.warning, /钻孔机/);
});

test("delivery at the exact deadline succeeds before overdue settlement", () => {
  const level = LEVELS[6];
  let design = createEmptyDesign();
  design = addNamedDevice(design, "lathe", "lathe", 0);
  design = addNamedDevice(design, "exit", "exit", 1);
  design = connectDevices(design, "lathe", "exit", level);
  const scenario = createScenario(6, [
    { id: "just-in-time", productId: "standard", status: "inProduction", deadlineAt: 5 },
  ]);
  const state = createProductionState(design, level, scenario);
  state.mode = "running";
  state.elapsed = 4.99;
  state.lines["lathe->exit"].item = {
    kind: "bolt",
    orderId: "just-in-time",
    productId: "standard",
    recipeStepIndex: 3,
    progress: 0.98,
    status: "moving",
    transportDuration: 0.5,
  };

  const delivered = advanceProduction(state, design, level, 0.01);

  assert.equal(delivered.elapsed, 5);
  assert.equal(delivered.mode, "success");
  assert.equal(delivered.failure, null);
});

test("an unfinished order fails immediately at its deadline with structured details", () => {
  const level = LEVELS[6];
  const scenario = createScenario(6, [
    { id: "late-order", productId: "precision", status: "waiting", deadlineAt: 5 },
  ]);
  const state = startScenario(createRecipeDesign(level), level, scenario);
  state.elapsed = 4.99;

  const failed = advanceProduction(state, createRecipeDesign(level), level, 0.01);

  assert.equal(failed.mode, "failure");
  assert.equal(failed.orders[0].status, "overdue");
  assert.deepEqual(failed.failure, {
    orderId: "late-order",
    productId: "precision",
    overdueSeconds: 0,
  });
});

test("overdue order details take priority over legacy failure diagnostics", () => {
  assert.equal(
    getFailureDiagnostic(
      "旧机器警告",
      "旧上下文反馈",
      "旧路线提示",
      { orderId: "L8-06", productId: "rustproof", overdueSeconds: 1.25 },
    ),
    "订单 L8-06（防锈螺栓）已超时 1.25 秒。",
  );
});

test("levels six through ten complete their fixed scenarios with deadline-first queues", () => {
  for (const levelId of [6, 7, 8, 9, 10]) {
    const level = LEVELS[levelId];
    const scenario = createOrderScenario(levelId, FIXED_LEVEL_SEEDS[levelId]);
    const design = createRecipeDesign(level);
    assertRecipeDesignIsLegal(design, level);
    const completed = simulateScheduledScenario(design, level, scenario);

    assert.equal(
      completed.mode,
      "success",
      `level ${levelId}: ${JSON.stringify({
        elapsed: completed.elapsed,
        failure: completed.failure,
        orders: completed.orders,
        queue: completed.queue,
        completedOrderIds: completed.completedOrderIds,
        machines: completed.machines,
        lines: completed.lines,
      })}`,
    );
    assert.equal(completed.completed, scenario.orders.length);
  }
});

test("editing a paused chapter-two attempt restarts the same seed from pristine orders", () => {
  const level = LEVELS[6];
  const design = createRecipeDesign(level);
  const scenario = createOrderScenario(level.id, FIXED_LEVEL_SEEDS[level.id]);
  let state = startScenario(design, level, scenario);
  state = advanceProduction(state, design, level, scenario.orders[0].arrivesAt);
  state = enqueueProductionOrder(state, scenario.orders[0].id);
  state = advanceProduction(state, design, level, 1);
  assert.equal(state.orders[0].status, "inProduction");

  const restarted = startProduction(pauseProduction(state), {
    edited: true,
    design,
    level,
  });

  assert.equal(restarted.mode, "running");
  assert.equal(restarted.scenarioSeed, scenario.seed);
  assert.equal(restarted.elapsed, 0);
  assert.deepEqual(restarted.orders, scenario.orders);
  assert.deepEqual(restarted.queue, scenario.queue);
  assert.deepEqual(restarted.completedOrderIds, []);
  assert.equal(restarted.failure, null);
  assert.equal(Object.values(restarted.sources).every((source) => source.output === null), true);
  assert.equal(Object.values(restarted.lines).every((line) => line.item === null), true);
  assert.equal(
    Object.values(restarted.machines).every(
      (machine) => !machine.active && !machine.waiting && !machine.output,
    ),
    true,
  );
});

test("leaving an urgent order behind a long recipe causes an overdue failure", () => {
  const level = LEVELS[6];
  const scenario = createScenario(6, [
    { id: "not-urgent", productId: "precision", deadlineAt: 40 },
    { id: "urgent", productId: "precision", deadlineAt: 12 },
  ]);
  let state = startScenario(createRecipeDesign(level), level, scenario);
  state = enqueueProductionOrder(state, "not-urgent");
  state = enqueueProductionOrder(state, "urgent");
  state = advanceProduction(state, createRecipeDesign(level), level, 12);

  assert.equal(state.mode, "failure");
  assert.equal(state.failure.orderId, "urgent");
});
