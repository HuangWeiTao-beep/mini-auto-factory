import assert from "node:assert/strict";
import test from "node:test";

import {
  DEVICE_TYPES,
  LEVELS,
  MATERIALS,
  createOrderScenario,
  getAllowedPaletteTypes,
  isOrderSchedulingLevel,
} from "../app/game/factory-model.mjs";
import {
  PRODUCTS,
  activateArrivedOrders,
  createSeededRandom,
  enqueueWaitingOrder,
  getProduct,
  moveQueuedOrder,
  shufflePaletteTypes,
} from "../app/game/order-scheduling.mjs";

const FIXED_LEVEL_SEEDS = Object.freeze({
  6: 1606,
  7: 1707,
  8: 1808,
  9: 1909,
  10: 2010,
});

function summarizeScenario(scenario) {
  return {
    paletteTypes: scenario.paletteTypes,
    orders: scenario.orders.map((order) => ({
      id: order.id,
      productId: order.productId,
      arrivesAt: order.arrivesAt,
      deadlineAt: order.deadlineAt,
      status: order.status,
    })),
  };
}

test("seeded random produces a stable deterministic number stream", () => {
  const a = createSeededRandom("L6:1606");
  const b = createSeededRandom("L6:1606");
  const c = createSeededRandom("L6:1607");

  const sampleA = [a(), a(), a()].map((value) => Number(value.toFixed(6)));
  const sampleB = [b(), b(), b()].map((value) => Number(value.toFixed(6)));
  const sampleC = [c(), c(), c()].map((value) => Number(value.toFixed(6)));

  assert.deepEqual(sampleA, sampleB);
  assert.notDeepEqual(sampleA, sampleC);
});

test("product catalog exposes the four chapter-two recipes", () => {
  assert.deepEqual(Object.keys(PRODUCTS), ["standard", "precision", "rustproof", "hardened"]);
  assert.deepEqual(getProduct("rustproof"), {
    id: "rustproof",
    label: "防锈螺栓",
    ariaLabel: "防锈螺栓订单",
    colorToken: "order-rustproof",
    route: ["source", "cutter", "lathe", "coater", "exit"],
  });
});

test("hardened bolts use the heat-treatment route", () => {
  assert.deepEqual(PRODUCTS.hardened.route, [
    "source", "cutter", "lathe", "heatTreater", "exit",
  ]);
  assert.equal(DEVICE_TYPES.heatTreater.label, "热处理炉");
  assert.equal(DEVICE_TYPES.heatTreater.accepts, "bolt");
  assert.equal(DEVICE_TYPES.heatTreater.produces, "hardenedBolt");
  assert.equal(MATERIALS.hardenedBolt.label, "强化螺栓");
});

test("palette shuffle is deterministic and preserves the allowed machine set", () => {
  const allowed = getAllowedPaletteTypes(LEVELS[8]);
  const first = shufflePaletteTypes(allowed, "L8:1808");
  const second = shufflePaletteTypes(allowed, "L8:1808");
  const third = shufflePaletteTypes(allowed, "L8:1809");

  assert.deepEqual(first, second);
  assert.notDeepEqual(first, third);
  assert.deepEqual([...first].sort(), [...allowed].sort());
});

test("same level plus seed yields the same scenario while a different seed changes the attempt", () => {
  const first = createOrderScenario(6, FIXED_LEVEL_SEEDS[6]);
  const same = createOrderScenario(6, FIXED_LEVEL_SEEDS[6]);
  const different = createOrderScenario(6, FIXED_LEVEL_SEEDS[6] + 1);

  assert.deepEqual(first, same);
  assert.notDeepEqual(summarizeScenario(first), summarizeScenario(different));
});

test("arrived orders flip from scheduled to waiting and can be queued and reordered immutably", () => {
  const beforeArrival = createOrderScenario(6, FIXED_LEVEL_SEEDS[6]);
  const activated = activateArrivedOrders(beforeArrival, 18);
  const firstWaitingOrder = activated.orders.find((order) => order.status === "waiting");

  assert.equal(beforeArrival.orders.every((order) => order.status === "scheduled"), true);
  assert.ok(firstWaitingOrder);

  const queuedOnce = enqueueWaitingOrder(activated, firstWaitingOrder.id);
  const queuedTwice = enqueueWaitingOrder(queuedOnce, firstWaitingOrder.id);

  assert.equal(queuedOnce.queue.length, 1);
  assert.deepEqual(queuedOnce.queue, [firstWaitingOrder.id]);
  assert.equal(
    queuedOnce.orders.find((order) => order.id === firstWaitingOrder.id)?.status,
    "queued",
  );
  assert.equal(queuedTwice.queue.length, 1);

  const anotherWaiting = queuedOnce.orders.find(
    (order) => order.status === "waiting" && order.id !== firstWaitingOrder.id,
  );
  const queuedTwo = enqueueWaitingOrder(queuedOnce, anotherWaiting.id);
  const moved = moveQueuedOrder(queuedTwo, anotherWaiting.id, 0);

  assert.deepEqual(queuedTwo.queue, [firstWaitingOrder.id, anotherWaiting.id]);
  assert.deepEqual(moved.queue, [anotherWaiting.id, firstWaitingOrder.id]);
  assert.deepEqual(queuedTwo.queue, [firstWaitingOrder.id, anotherWaiting.id]);
});

test("chapter-two level helpers identify order scheduling stages", () => {
  assert.equal(isOrderSchedulingLevel(LEVELS[5]), false);
  assert.equal(isOrderSchedulingLevel(LEVELS[6]), true);
  assert.equal(isOrderSchedulingLevel(10), true);
});

test("chapter-two scenarios honor the approved order matrix", () => {
  const approvedMatrix = {
    6: { orderCount: 6, arrivalWindow: [0, 24], deadlineLeadWindow: [22, 22] },
    7: { orderCount: 8, arrivalWindow: [0, 30], deadlineLeadWindow: [18, 26] },
    8: { orderCount: 8, arrivalWindow: [0, 34], deadlineLeadWindow: [24, 32] },
    9: { orderCount: 10, arrivalWindow: [0, 42], deadlineLeadWindow: [22, 34] },
    10: { orderCount: 12, arrivalWindow: [0, 50], deadlineLeadWindow: [20, 32] },
  };

  for (const [levelIdText, expected] of Object.entries(approvedMatrix)) {
    const levelId = Number(levelIdText);
    const scenario = createOrderScenario(levelId, FIXED_LEVEL_SEEDS[levelId]);

    assert.equal(scenario.orders.length, expected.orderCount);
    assert.deepEqual(LEVELS[levelId].orderConfig.arrivalWindow, expected.arrivalWindow);
    assert.deepEqual(
      LEVELS[levelId].orderConfig.deadlineLeadWindow,
      expected.deadlineLeadWindow,
    );
    for (const order of scenario.orders) {
      const deadlineLead = order.deadlineAt - order.arrivesAt;
      assert.ok(order.arrivesAt >= expected.arrivalWindow[0]);
      assert.ok(order.arrivesAt <= expected.arrivalWindow[1]);
      assert.ok(deadlineLead >= expected.deadlineLeadWindow[0]);
      assert.ok(deadlineLead <= expected.deadlineLeadWindow[1]);
    }
  }
});

test("every chapter-two seed keeps the intended product mix", () => {
  for (const levelId of [6, 7]) {
    const productIds = new Set(
      createOrderScenario(levelId, FIXED_LEVEL_SEEDS[levelId]).orders.map(
        (order) => order.productId,
      ),
    );
    assert.deepEqual([...productIds].sort(), ["precision", "standard"]);
  }

  for (const levelId of [8, 9, 10]) {
    const productIds = new Set(
      createOrderScenario(levelId, FIXED_LEVEL_SEEDS[levelId]).orders.map(
        (order) => order.productId,
      ),
    );
    assert.deepEqual([...productIds].sort(), ["precision", "rustproof", "standard"]);
  }
});
