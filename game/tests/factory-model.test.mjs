import assert from "node:assert/strict";
import test from "node:test";

import {
  addDevice,
  advanceProduction,
  canPlaceDevice,
  connectDevices,
  createEmptyDesign,
  createProductionState,
  DEVICE_TYPES,
  getDeviceLimit,
  getAllowedPaletteTypes,
  getLevelConfig,
  isOrderSchedulingLevel,
  LEVELS,
  moveDevice,
  nextUnlockedLevel,
  outgoing,
  pauseProduction,
  removeConnection,
  startProduction,
} from "../app/game/factory-model.mjs";

function createDesign(types) {
  let design = createEmptyDesign();
  types.forEach((type, index) => {
    design = addDevice(design, type, 80 + index * 210, 180, type);
  });
  return design;
}

function createCorrectDesign() {
  let design = createDesign(["source", "cutter", "lathe", "exit"]);
  design = connectDevices(design, "source", "cutter");
  design = connectDevices(design, "cutter", "lathe");
  design = connectDevices(design, "lathe", "exit");
  return design;
}

function simulate(design, seconds) {
  return simulateAtLevel(design, LEVELS[1], seconds);
}

function createLevelTwoDesign(withDrill) {
  let design = createDesign(
    withDrill
      ? ["source", "cutter", "lathe", "drill", "exit"]
      : ["source", "cutter", "lathe", "exit"],
  );
  design = connectDevices(design, "source", "cutter");
  design = connectDevices(design, "cutter", "lathe");
  design = connectDevices(design, "lathe", withDrill ? "drill" : "exit");
  if (withDrill) design = connectDevices(design, "drill", "exit");
  return design;
}

function simulateAtLevel(design, level, seconds) {
  return advanceProduction(
    startProduction(createProductionState(design), {
      edited: false,
      design,
      level,
    }),
    design,
    level,
    seconds,
  );
}

function createLevelThreeDesign(branchCount) {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 80, 180, "source");
  design = addDevice(design, "exit", 920, 180, "exit");

  for (const suffix of ["a", "b"].slice(0, branchCount)) {
    design = addDevice(design, "cutter", 290, 180, `cutter-${suffix}`);
    design = addDevice(design, "lathe", 500, 180, `lathe-${suffix}`);
    design = addDevice(design, "drill", 710, 180, `drill-${suffix}`);
    design = connectDevices(design, "source", `cutter-${suffix}`, LEVELS[3]);
    design = connectDevices(design, `cutter-${suffix}`, `lathe-${suffix}`, LEVELS[3]);
    design = connectDevices(design, `lathe-${suffix}`, `drill-${suffix}`, LEVELS[3]);
    design = connectDevices(design, `drill-${suffix}`, "exit", LEVELS[3]);
  }

  return design;
}

function createLevelFourLineDesign(cutterGridX) {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 36, 36, "source");
  design = addDevice(design, "cutter", cutterGridX * 36, 36, "cutter");
  return connectDevices(design, "source", "cutter", LEVELS[4]);
}

function createCompactSingleLineDesign(level) {
  let design = createEmptyDesign();
  const positions = [
    [1, 2],
    [1, 6],
    [6, 6],
    [6, 10],
    [11, 10],
  ];
  for (const [index, type] of ["source", "cutter", "lathe", "drill", "exit"].entries()) {
    const [gridX, gridY] = positions[index];
    design = addDevice(design, type, gridX * 36, gridY * 36, type);
  }
  design = connectDevices(design, "source", "cutter", level);
  design = connectDevices(design, "cutter", "lathe", level);
  design = connectDevices(design, "lathe", "drill", level);
  return connectDevices(design, "drill", "exit", level);
}

function createSparseLevelFourDesign() {
  let design = createEmptyDesign();
  const positions = [
    [1, 2],
    [16, 2],
    [1, 7],
    [16, 7],
    [11, 2],
  ];
  for (const [index, type] of ["source", "cutter", "lathe", "drill", "exit"].entries()) {
    const [gridX, gridY] = positions[index];
    design = addDevice(design, type, gridX * 36, gridY * 36, type);
  }
  design = connectDevices(design, "source", "cutter", LEVELS[4]);
  design = connectDevices(design, "cutter", "lathe", LEVELS[4]);
  design = connectDevices(design, "lathe", "drill", LEVELS[4]);
  return connectDevices(design, "drill", "exit", LEVELS[4]);
}

function launchLevelFourLine(design) {
  const state = createProductionState(design);
  state.mode = "running";
  state.sources.source.output = "rod";
  return advanceProduction(state, design, LEVELS[4], 0.01);
}

function createCompactLevelFiveDesign() {
  let design = createEmptyDesign();
  const devices = [
    ["source", "source", 6, 2],
    ["exit", "exit", 6, 10],
    ["cutter-a", "cutter", 1, 2],
    ["lathe-a", "lathe", 1, 6],
    ["drill-a", "drill", 1, 10],
    ["cutter-b", "cutter", 11, 2],
    ["lathe-b", "lathe", 11, 6],
    ["drill-b", "drill", 11, 10],
  ];
  for (const [id, type, gridX, gridY] of devices) {
    design = addDevice(design, type, gridX * 36, gridY * 36, id);
  }
  for (const suffix of ["a", "b"]) {
    design = connectDevices(design, "source", `cutter-${suffix}`, LEVELS[5]);
    design = connectDevices(design, `cutter-${suffix}`, `lathe-${suffix}`, LEVELS[5]);
    design = connectDevices(design, `lathe-${suffix}`, `drill-${suffix}`, LEVELS[5]);
    design = connectDevices(design, `drill-${suffix}`, "exit", LEVELS[5]);
  }
  return design;
}

function assertPlayerReachableLayout(design, level) {
  const devices = Object.values(design.devices);
  for (const device of devices) {
    assert.ok(device.gridX >= 0 && device.gridX <= 16);
    assert.ok(device.gridY >= 2 && device.gridY <= 10);
    assert.equal(
      level.obstacles.some(
        (obstacle) => obstacle.gridX === device.gridX && obstacle.gridY === device.gridY,
      ),
      false,
    );
  }
  for (const [index, device] of devices.entries()) {
    for (const other of devices.slice(index + 1)) {
      const overlaps =
        Math.abs(device.gridX - other.gridX) * 36 < 154 &&
        Math.abs(device.gridY - other.gridY) * 36 < 132;
      assert.equal(overlaps, false, `${device.id} and ${other.id} must not overlap`);
    }
  }
}

test("level helpers expose limits and unlock only the next chapter level", () => {
  assert.equal(getLevelConfig(4), LEVELS[4]);
  assert.equal(getDeviceLimit(LEVELS[3], "lathe"), 2);
  assert.equal(nextUnlockedLevel(2, 3), 4);
  assert.equal(nextUnlockedLevel(5, 5), 6);
});

test("the five level configurations match the approved chapter-one rules", () => {
  const summary = [1, 2, 3, 4, 5].map((levelId) => {
    const level = LEVELS[levelId];
    return {
      id: level.id,
      name: level.name,
      duration: level.duration,
      target: level.target,
      deviceLimits: level.deviceLimits,
    transportMode: level.transportMode,
      transportDuration: level.transportDuration,
      sourceInterval: level.sourceInterval,
      machineDurations: level.machineDurations,
      obstacles: level.obstacles,
    };
  });

  assert.deepEqual(summary, [
    {
      id: 1,
      name: "螺栓生产",
      duration: 60,
      target: 10,
      deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 0, exit: 1 },
      transportMode: "fixed",
      transportDuration: 0.5,
      sourceInterval: 3,
      machineDurations: { cutter: 2, lathe: 3, drill: 2 },
      obstacles: [],
    },
    {
      id: 2,
      name: "钻孔定位",
      duration: 45,
      target: 10,
      deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, exit: 1 },
      transportMode: "fixed",
      transportDuration: 0.5,
      sourceInterval: 3,
      machineDurations: { cutter: 2, lathe: 3, drill: 2 },
      obstacles: [],
    },
    {
      id: 3,
      name: "产能告急",
      duration: 27,
      target: 12,
      deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, exit: 1 },
      transportMode: "fixed",
      transportDuration: 0.5,
      sourceInterval: 1,
      machineDurations: { cutter: 1, lathe: 3, drill: 1 },
      obstacles: [],
    },
    {
      id: 4,
      name: "有限工位",
      duration: 48,
      target: 10,
      deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, exit: 1 },
      transportMode: "distance",
      transportDuration: 0.5,
      sourceInterval: 3,
      machineDurations: { cutter: 2, lathe: 3, drill: 2 },
      obstacles: [{ gridX: 7, gridY: 3 }, { gridX: 12, gridY: 7 }, { gridX: 17, gridY: 3 }],
    },
    {
      id: 5,
      name: "工坊验收",
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
    },
  ]);
});

test("levels three and five expose exactly one fast source", () => {
  assert.equal(getDeviceLimit(LEVELS[3], "source"), 1);
  assert.equal(getDeviceLimit(LEVELS[5], "source"), 1);
});

test("level five exposes the workshop acceptance display name", () => {
  assert.equal(getLevelConfig(5).name, "工坊验收");
  assert.equal(getLevelConfig(5).duration, 36);
});

test("success unlocks the next level while completing level five keeps the chapter capped", () => {
  assert.equal(nextUnlockedLevel(1, 1), 2);
  assert.equal(nextUnlockedLevel(5, 5), 6);
  assert.equal(nextUnlockedLevel(9, 9), 10);
  assert.equal(nextUnlockedLevel(10, 10), 10);
});

test("chapter-two helpers expose the new order-scheduling machine palette", () => {
  assert.equal(isOrderSchedulingLevel(LEVELS[5]), false);
  assert.equal(isOrderSchedulingLevel(LEVELS[6]), true);
  assert.equal(DEVICE_TYPES.coater.label, "镀层机");
  assert.deepEqual(getAllowedPaletteTypes(LEVELS[6]), [
    "source",
    "cutter",
    "lathe",
    "drill",
    "exit",
  ]);
  assert.deepEqual(getAllowedPaletteTypes(LEVELS[8]), [
    "source",
    "cutter",
    "lathe",
    "drill",
    "coater",
    "exit",
  ]);
});

test("levels six through ten expose the approved chapter-two configuration shell", () => {
  const summary = [6, 7, 8, 9, 10].map((levelId) => {
    const level = LEVELS[levelId];
    return {
      id: level.id,
      name: level.name,
      chapter: level.chapter,
      mode: level.mode,
      duration: level.duration,
      target: level.target,
      deviceLimits: level.deviceLimits,
      transportMode: level.transportMode,
      machineDurations: level.machineDurations,
      obstacles: level.obstacles,
      connectionRules: level.connectionRules,
      paletteTypes: getAllowedPaletteTypes(level),
      orderConfig: level.orderConfig,
    };
  });

  assert.deepEqual(summary, [
    {
      id: 6,
      name: "订单看板",
      chapter: 2,
      mode: "orderScheduling",
      duration: 70,
      target: 4,
      deviceLimits: { source: 1, cutter: 1, lathe: 1, drill: 1, coater: 0, exit: 1 },
      transportMode: "fixed",
      machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
      obstacles: [],
      connectionRules: { allowsParallelInputs: false, allowsParallelOutputs: false },
      paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
      orderConfig: {
        orderCount: 4,
        arrivalWindow: [4, 26],
        deadlineLeadWindow: [12, 20],
        productPool: ["standard", "precision"],
        paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
      },
    },
    {
      id: 7,
      name: "双线调度",
      chapter: 2,
      mode: "orderScheduling",
      duration: 75,
      target: 5,
      deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 0, exit: 1 },
      transportMode: "distance",
      machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
      obstacles: [{ gridX: 8, gridY: 4 }, { gridX: 13, gridY: 8 }],
      connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
      paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
      orderConfig: {
        orderCount: 5,
        arrivalWindow: [3, 30],
        deadlineLeadWindow: [12, 18],
        productPool: ["standard", "precision"],
        paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
      },
    },
    {
      id: 8,
      name: "镀层介入",
      chapter: 2,
      mode: "orderScheduling",
      duration: 80,
      target: 6,
      deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 1, coater: 1, exit: 1 },
      transportMode: "fixed",
      machineDurations: { cutter: 2, lathe: 3, drill: 2, coater: 2 },
      obstacles: [{ gridX: 8, gridY: 4 }, { gridX: 13, gridY: 8 }],
      connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
      paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      orderConfig: {
        orderCount: 6,
        arrivalWindow: [2, 36],
        deadlineLeadWindow: [11, 19],
        productPool: ["standard", "precision", "rustproof"],
        paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      },
    },
    {
      id: 9,
      name: "混单瓶颈",
      chapter: 2,
      mode: "orderScheduling",
      duration: 85,
      target: 6,
      deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, coater: 1, exit: 1 },
      transportMode: "distance",
      machineDurations: { cutter: 1, lathe: 3, drill: 2, coater: 2 },
      obstacles: [
        { gridX: 6, gridY: 3 },
        { gridX: 10, gridY: 6 },
        { gridX: 15, gridY: 9 },
      ],
      connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
      paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      orderConfig: {
        orderCount: 6,
        arrivalWindow: [2, 34],
        deadlineLeadWindow: [10, 18],
        productPool: ["standard", "precision", "rustproof"],
        paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      },
    },
    {
      id: 10,
      name: "总装排程",
      chapter: 2,
      mode: "orderScheduling",
      duration: 90,
      target: 7,
      deviceLimits: { source: 1, cutter: 2, lathe: 2, drill: 2, coater: 2, exit: 1 },
      transportMode: "distance",
      machineDurations: { cutter: 1, lathe: 3, drill: 1, coater: 2 },
      obstacles: [
        { gridX: 6, gridY: 3 },
        { gridX: 10, gridY: 6 },
        { gridX: 15, gridY: 9 },
        { gridX: 18, gridY: 4 },
      ],
      connectionRules: { allowsParallelInputs: true, allowsParallelOutputs: true },
      paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      orderConfig: {
        orderCount: 7,
        arrivalWindow: [1, 38],
        deadlineLeadWindow: [9, 17],
        productPool: ["standard", "precision", "rustproof"],
        paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
      },
    },
  ]);
});

test("production state indexes every source by device id without a legacy source alias", () => {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 80, 180, "source-a");
  design = addDevice(design, "source", 290, 180, "source-b");
  const state = createProductionState(design);

  assert.deepEqual(Object.keys(state.sources), ["source-a", "source-b"]);
  assert.equal("source" in state, false);
});

test("the correct line completes ten bolts exactly at 36.5 seconds", () => {
  const state = simulate(createCorrectDesign(), 36.5);
  assert.equal(state.completed, 10);
  assert.equal(state.mode, "success");
  assert.equal(state.elapsed, 36.5);
});

test("the first bolt follows source, transport, cutting, turning and exit timing", () => {
  const design = createCorrectDesign();
  assert.equal(simulate(design, 9.4).completed, 0);
  assert.equal(simulate(design, 9.6).completed, 1);
});

test("level two discards an undrilled bolt at the exit with a quality warning", () => {
  const state = simulateAtLevel(createLevelTwoDesign(false), LEVELS[2], 20);
  assert.equal(state.completed, 0);
  assert.equal(state.warning, "\u7f3a\u5c11\u5b54\u4f4d");
  assert.equal(Object.values(state.lines).every((line) => line.item === null), true);
});

test("level two correct line finishes ten drilled bolts by 39 seconds", () => {
  const state = simulateAtLevel(createLevelTwoDesign(true), LEVELS[2], 39);
  assert.equal(state.completed, 10);
  assert.equal(state.mode, "success");
  assert.ok(state.elapsed <= 39);
});

test("a rod sent directly to the lathe raises the specified warning", () => {
  let design = createDesign(["source", "lathe"]);
  design = connectDevices(design, "source", "lathe");
  const state = simulate(design, 4);
  assert.equal(
    state.warning,
    "车削机不能加工长钢棒，需要先完成切割工序。",
  );
  assert.equal(state.completed, 0);
  assert.equal(Object.values(state.lines)[0].item?.status, "blocked");
});

test("connection rules reject reused ports and self connections", () => {
  let design = createDesign(["source", "cutter", "lathe"]);
  design = connectDevices(design, "source", "cutter");
  const unchangedOutput = connectDevices(design, "source", "lathe");
  const unchangedInput = connectDevices(design, "lathe", "cutter");
  const unchangedSelf = connectDevices(design, "lathe", "lathe");
  assert.deepEqual(unchangedOutput, design);
  assert.deepEqual(unchangedInput, design);
  assert.deepEqual(unchangedSelf, design);
});

test("level three permits a second outgoing branch and assigns branch indexes", () => {
  let design = createDesign(["source", "cutter", "lathe"]);
  design = connectDevices(design, "source", "cutter", LEVELS[3]);
  design = connectDevices(design, "source", "lathe", LEVELS[3]);
  const duplicate = connectDevices(design, "source", "cutter", LEVELS[3]);

  assert.deepEqual(
    design.connections.map(({ from, to, branchIndex }) => ({ from, to, branchIndex })),
    [
      { from: "source", to: "cutter", branchIndex: 0 },
      { from: "source", to: "lathe", branchIndex: 1 },
    ],
  );
  assert.equal(duplicate, design);
});

test("removing an outbound branch does not reuse its index and routing stays ordered", () => {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 80, 180, "source");
  for (const suffix of ["a", "b", "c"]) {
    design = addDevice(design, "cutter", 290, 180, `cutter-${suffix}`);
  }
  design = connectDevices(design, "source", "cutter-a", LEVELS[3]);
  design = connectDevices(design, "source", "cutter-b", LEVELS[3]);
  design = removeConnection(design, "source->cutter-a");
  design = connectDevices(design, "source", "cutter-c", LEVELS[3]);

  assert.deepEqual(
    outgoing(design, "source").map(({ id, branchIndex }) => ({ id, branchIndex })),
    [
      { id: "source->cutter-b", branchIndex: 1 },
      { id: "source->cutter-c", branchIndex: 2 },
    ],
  );

  const state = createProductionState(design);
  state.mode = "running";
  state.sources.source.output = "rod";
  const afterB = advanceProduction(state, design, LEVELS[3], 0.01);
  assert.equal(afterB.lines["source->cutter-b"].item?.status, "moving");
  assert.equal(afterB.routingCursor.source, 1);

  afterB.sources.source.output = "rod";
  const afterC = advanceProduction(afterB, design, LEVELS[3], 0.01);
  assert.equal(afterC.lines["source->cutter-c"].item?.status, "moving");
});

test("level five permits fan-out and fan-in connections", () => {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 80, 180, "source");
  design = addDevice(design, "cutter", 290, 80, "cutter-a");
  design = addDevice(design, "cutter", 290, 280, "cutter-b");
  design = addDevice(design, "lathe", 500, 180, "lathe");
  design = connectDevices(design, "source", "cutter-a", LEVELS[5]);
  design = connectDevices(design, "source", "cutter-b", LEVELS[5]);
  design = connectDevices(design, "cutter-a", "lathe", LEVELS[5]);
  design = connectDevices(design, "cutter-b", "lathe", LEVELS[5]);

  assert.equal(outgoing(design, "source").length, 2);
  assert.equal(design.connections.filter(({ to }) => to === "lathe").length, 2);
});

test("level four rejects obstacle placement but allows a connection across the obstacle", () => {
  const emptyDesign = createEmptyDesign();
  assert.equal(
    canPlaceDevice(emptyDesign, LEVELS[4], { gridX: 7, gridY: 3 }),
    false,
  );

  let designAcrossObstacle = createEmptyDesign();
  designAcrossObstacle = addDevice(designAcrossObstacle, "cutter", 36, 108, "cutter");
  designAcrossObstacle = addDevice(designAcrossObstacle, "lathe", 468, 108, "lathe");
  assert.equal(
    canPlaceDevice(designAcrossObstacle, LEVELS[4], { gridX: 1, gridY: 3 }),
    false,
  );
  assert.equal(
    canPlaceDevice(
      designAcrossObstacle,
      LEVELS[4],
      { gridX: 1, gridY: 3 },
      "cutter",
    ),
    true,
  );
  assert.notEqual(
    connectDevices(designAcrossObstacle, "cutter", "lathe", LEVELS[4]),
    designAcrossObstacle,
  );
});

test("placement rejects any card footprint overlap while allowing the minimum clear spacing", () => {
  let design = createEmptyDesign();
  design = addDevice(design, "cutter", 2 * 36, 2 * 36, "cutter");

  assert.equal(canPlaceDevice(design, LEVELS[1], { gridX: 3, gridY: 2 }), false);
  assert.equal(canPlaceDevice(design, LEVELS[1], { gridX: 6, gridY: 5 }), false);
  assert.equal(canPlaceDevice(design, LEVELS[1], { gridX: 6, gridY: 6 }), true);
});

test("a longer level-four line takes longer to deliver the same material", () => {
  const compactDesign = createLevelFourLineDesign(2);
  const longDesign = createLevelFourLineDesign(7);

  const compactLaunched = launchLevelFourLine(compactDesign);
  const longLaunched = launchLevelFourLine(longDesign);
  assert.equal(compactLaunched.lines["source->cutter"].item.transportDuration, 0.5);
  assert.equal(longLaunched.lines["source->cutter"].item.transportDuration, 3);

  assert.equal(
    advanceProduction(compactLaunched, compactDesign, LEVELS[4], 0.49).machines.cutter.active,
    null,
  );
  assert.equal(
    advanceProduction(longLaunched, longDesign, LEVELS[4], 2.99).machines.cutter.active,
    null,
  );
  assert.equal(
    advanceProduction(longLaunched, longDesign, LEVELS[4], 3).machines.cutter.active,
    "rod",
  );
});

test("a launched level-four item keeps its original transport duration after devices move", () => {
  const longDesign = createLevelFourLineDesign(7);
  const launched = launchLevelFourLine(longDesign);
  const movedDesign = moveDevice(longDesign, "cutter", 72, 36);

  assert.equal(
    advanceProduction(launched, movedDesign, LEVELS[4], 0.5).machines.cutter.active,
    null,
  );
  assert.equal(
    advanceProduction(launched, movedDesign, LEVELS[4], 3).machines.cutter.active,
    "rod",
  );
});

test("a compact non-overlapping level-five layout completes fourteen bolts within thirty-six seconds", () => {
  const design = createCompactLevelFiveDesign();
  const sources = Object.values(design.devices).filter(({ type }) => type === "source");

  assertPlayerReachableLayout(design, LEVELS[5]);
  assert.equal(sources.length, 1);
  assert.equal(outgoing(design, sources[0].id).length, 2);

  const state = simulateAtLevel(design, LEVELS[5], LEVELS[5].duration);

  assert.equal(state.completed, 14);
  assert.equal(state.mode, "success");
  assert.ok(state.elapsed <= LEVELS[5].duration);
});

test("a compact level-four line completes its target within the full time limit", () => {
  const design = createCompactSingleLineDesign(LEVELS[4]);
  const state = simulateAtLevel(design, LEVELS[4], LEVELS[4].duration);

  assertPlayerReachableLayout(design, LEVELS[4]);
  assert.equal(state.completed, 10);
  assert.equal(state.mode, "success");
  assert.ok(state.elapsed <= LEVELS[4].duration);
});

test("a sparse level-four line misses the target because distance consumes its time budget", () => {
  const design = createSparseLevelFourDesign();
  const state = simulateAtLevel(design, LEVELS[4], 50);

  assertPlayerReachableLayout(design, LEVELS[4]);
  assert.equal(state.mode, "failure");
  assert.ok(state.completed < LEVELS[4].target);
  assert.equal(state.elapsed, LEVELS[4].duration);
});

test("a single level-five branch fails the workshop target before time expires", () => {
  const design = createCompactSingleLineDesign(LEVELS[5]);
  const state = simulateAtLevel(design, LEVELS[5], 40);

  assertPlayerReachableLayout(design, LEVELS[5]);
  assert.equal(state.mode, "failure");
  assert.ok(state.completed < LEVELS[5].target);
  assert.equal(state.elapsed, LEVELS[5].duration);
});

test("level three dispatches A then B and holds output when the selected A branch is occupied", () => {
  const design = createLevelThreeDesign(2);
  const running = startProduction(createProductionState(design), {
    edited: false,
    design,
    level: LEVELS[3],
  });

  const afterA = advanceProduction(running, design, LEVELS[3], 1);
  assert.equal(afterA.lines["source->cutter-a"].item?.status, "moving");
  assert.equal(afterA.routingCursor.source, 1);

  const afterB = advanceProduction(afterA, design, LEVELS[3], 1);
  assert.equal(afterB.lines["source->cutter-b"].item?.status, "moving");
  assert.equal(afterB.routingCursor.source, 0);

  const blocked = createProductionState(design);
  blocked.mode = "running";
  blocked.sources.source.output = "rod";
  blocked.lines["source->cutter-a"].item = {
    kind: "rod",
    progress: 0,
    status: "moving",
  };
  const held = advanceProduction(blocked, design, LEVELS[3], 0.01);
  assert.equal(held.sources.source.output, "rod");
  assert.equal(held.lines["source->cutter-b"].item, null);
  assert.equal(held.routingCursor.source, 0);
});

test("a single level-three branch cannot reach twelve bolts by 27 seconds, while two branches can", () => {
  const singleBranch = simulateAtLevel(createLevelThreeDesign(1), LEVELS[3], 27);
  const twoBranches = simulateAtLevel(createLevelThreeDesign(2), LEVELS[3], 27);

  assert.notEqual(singleBranch.mode, "success");
  assert.equal(twoBranches.mode, "success");
  assert.ok(twoBranches.elapsed <= 27);
});

test("pause freezes production and editing makes the next start a clean attempt", () => {
  const design = createCorrectDesign();
  const running = advanceProduction(
    startProduction(createProductionState(design), {
      edited: false,
      design,
      level: LEVELS[1],
    }),
    design,
    LEVELS[1],
    12,
  );
  const paused = pauseProduction(running);
  assert.deepEqual(advanceProduction(paused, design, LEVELS[1], 5), paused);

  const resumed = startProduction(paused, { edited: false, design, level: LEVELS[1] });
  assert.equal(resumed.elapsed, paused.elapsed);
  assert.equal(resumed.completed, paused.completed);
  assert.equal(resumed.mode, "running");

  const reset = startProduction(paused, { edited: true, design, level: LEVELS[1] });
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.completed, 0);
  assert.equal(reset.mode, "running");
  assert.equal(Object.values(reset.lines).every((line) => line.item === null), true);
});

test("editing a paused level-four attempt restarts its full forty-eight second run", () => {
  let design = createEmptyDesign();
  for (const [index, type] of ["source", "cutter", "lathe", "drill", "exit"].entries()) {
    design = addDevice(design, type, (index + 1) * 36, 36, type);
  }
  design = connectDevices(design, "source", "cutter", LEVELS[4]);
  design = connectDevices(design, "cutter", "lathe", LEVELS[4]);
  design = connectDevices(design, "lathe", "drill", LEVELS[4]);
  design = connectDevices(design, "drill", "exit", LEVELS[4]);

  const running = advanceProduction(
    startProduction(createProductionState(design), {
      edited: false,
      design,
      level: LEVELS[4],
    }),
    design,
    LEVELS[4],
    20,
  );
  const paused = pauseProduction(running);
  assert.ok(paused.elapsed > 0);
  assert.ok(paused.completed > 0);

  const reset = startProduction(paused, {
    edited: true,
    design,
    level: LEVELS[4],
  });
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.completed, 0);
  assert.equal(LEVELS[4].duration, 48);
});

test("an incomplete design fails exactly at the sixty second limit", () => {
  const state = simulate(createDesign(["source"]), 80);
  assert.equal(state.mode, "failure");
  assert.equal(state.elapsed, 60);
  assert.equal(state.completed, 0);
});

test("legacy createProductionState keeps the exact chapter-one state contract", () => {
  const design = createDesign(["source", "cutter"]);

  assert.deepEqual(createProductionState(design), {
    mode: "design",
    elapsed: 0,
    completed: 0,
    sources: { source: { elapsed: 0, output: null, pulse: 0 } },
    machines: {
      cutter: {
        status: "idle",
        active: null,
        remaining: 0,
        waiting: null,
        output: null,
        warning: null,
      },
    },
    routingCursor: { source: 0, cutter: 0 },
    lines: {},
    warning: null,
  });
});
