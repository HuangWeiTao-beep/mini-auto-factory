import assert from "node:assert/strict";
import test from "node:test";

import {
  addDevice,
  advanceProduction,
  connectDevices,
  createEmptyDesign,
  createProductionState,
  getDeviceLimit,
  getLevelConfig,
  LEVELS,
  nextUnlockedLevel,
  pauseProduction,
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
    startProduction(createProductionState(design, level), {
      edited: false,
      design,
      level,
    }),
    design,
    level,
    seconds,
  );
}

test("level helpers expose limits and unlock only the next chapter level", () => {
  assert.equal(getLevelConfig(4), LEVELS[4]);
  assert.equal(getDeviceLimit(LEVELS[3], "lathe"), 2);
  assert.equal(nextUnlockedLevel(2, 3), 4);
  assert.equal(nextUnlockedLevel(5, 5), 5);
});

test("production state indexes every source by device id without a legacy source alias", () => {
  let design = createEmptyDesign();
  design = addDevice(design, "source", 80, 180, "source-a");
  design = addDevice(design, "source", 290, 180, "source-b");
  const state = createProductionState(design, LEVELS[1]);

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

test("pause freezes production and editing makes the next start a clean attempt", () => {
  const design = createCorrectDesign();
  const running = advanceProduction(
    startProduction(createProductionState(design, LEVELS[1]), {
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

test("an incomplete design fails exactly at the sixty second limit", () => {
  const state = simulate(createDesign(["source"]), 80);
  assert.equal(state.mode, "failure");
  assert.equal(state.elapsed, 60);
  assert.equal(state.completed, 0);
});
