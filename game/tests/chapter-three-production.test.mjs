import assert from "node:assert/strict";
import test from "node:test";
import {
  LEVELS,
  addDevice,
  advanceProduction,
  connectDevices,
  createEmptyDesign,
  createProductionState,
} from "../app/game/factory-model.mjs";
import { requestMaintenance } from "../app/game/maintenance-model.mjs";

const maintenanceLevel = {
  ...LEVELS[1],
  id: 99,
  chapter: 3,
  maintenance: {
    plannedDuration: 4,
    repairDuration: 7,
    slowdownThreshold: 85,
    failureThreshold: 100,
    wearPerCycle: { cutter: 10, lathe: 18 },
  },
};

function straightLineDesign(level) {
  let design = createEmptyDesign();
  for (const [index, type] of ["source", "cutter", "lathe", "drill", "exit"].entries()) {
    design = addDevice(design, type, index * 36, 0, type);
  }
  design = connectDevices(design, "source", "cutter", level);
  design = connectDevices(design, "cutter", "lathe", level);
  design = connectDevices(design, "lathe", "drill", level);
  return connectDevices(design, "drill", "exit", level);
}

function runningStraightLineState(design, level) {
  const state = createProductionState(design, level);
  state.mode = "running";
  return state;
}

function advanceUntil(state, design, level, predicate) {
  let current = state;
  const deadline = current.elapsed + 20;
  while (!predicate(current)) {
    if (current.elapsed >= deadline - 1e-9) {
      throw new Error("Simulation did not reach its expected state within 20 seconds.");
    }
    const next = advanceProduction(current, design, level, level.step);
    if (next.elapsed <= current.elapsed) {
      throw new Error("Simulation stalled before reaching its expected state.");
    }
    current = next;
  }
  return current;
}

function stateOneCycleFromFailure(level) {
  const design = straightLineDesign(level);
  const state = runningStraightLineState(design, level);
  state.machines.lathe.active = "blank";
  state.machines.lathe.remaining = level.step;
  state.machines.lathe.status = "working";
  state.machines.lathe.reliability.wear = 84;
  state.machines.cutter.reliability.status = "under-maintenance";
  state.maintenance.activeJob = { machineId: "cutter", kind: "planned", remaining: 20 };
  state.lines["cutter->lathe"].item = {
    kind: "blank",
    progress: 1,
    status: "waiting",
    transportDuration: level.transportDuration,
  };
  return { design, state };
}

test("maintenance levels initialize reliability without changing old levels", () => {
  const design = straightLineDesign(maintenanceLevel);
  const state = createProductionState(design, maintenanceLevel);

  assert.deepEqual(state.machines.lathe.reliability, { wear: 0, status: "available" });
  assert.deepEqual(state.maintenance, { activeJob: null, queue: [] });
  assert.equal("reliability" in createProductionState(design, LEVELS[1]).machines.lathe, false);
});

test("a requested machine finishes its active item, stops accepting, then resumes after four seconds", () => {
  const design = straightLineDesign(maintenanceLevel);
  let state = runningStraightLineState(design, maintenanceLevel);
  state = advanceUntil(state, design, maintenanceLevel, (current) => Boolean(current.machines.lathe.active));
  state.machines.lathe.reliability.wear = 84;
  state = requestMaintenance(state, "lathe", maintenanceLevel);
  state = advanceProduction(state, design, maintenanceLevel, 8);

  assert.equal(state.machines.lathe.reliability.wear, 0);
  assert.equal(state.machines.lathe.reliability.status, "available");
  assert.equal(state.maintenance.activeJob, null);
  assert.ok(state.completed >= 1);
});

test("the item that reaches failure is valid and the next item waits upstream", () => {
  const { design, state: initial } = stateOneCycleFromFailure(maintenanceLevel);
  const state = advanceProduction(initial, design, maintenanceLevel, 12);

  assert.ok(state.completed >= 1);
  assert.equal(state.machines.lathe.reliability.status, "broken");
  assert.equal(state.maintenance.queue[0].kind, "repair");
  assert.equal(state.lines["cutter->lathe"].item?.status, "waiting");
});

test("slowdown duration is locked when a maintenance machine starts work", () => {
  const design = straightLineDesign(maintenanceLevel);
  const state = runningStraightLineState(design, maintenanceLevel);
  state.machines.lathe.reliability.wear = 85;
  state.lines["cutter->lathe"].item = {
    kind: "blank",
    progress: 1,
    status: "waiting",
    transportDuration: maintenanceLevel.transportDuration,
  };

  const started = advanceProduction(state, design, maintenanceLevel, maintenanceLevel.step);
  assert.equal(started.machines.lathe.remaining, 3.6);
});
