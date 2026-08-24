import assert from "node:assert/strict";
import test from "node:test";
import {
  LEVELS,
  addDevice,
  advanceProduction,
  canPlaceDevice,
  connectDevices,
  createEmptyDesign,
  createOrderScenario,
  createProductionState,
  createScenarioValidationDesign,
  enqueueProductionOrder,
  moveProductionOrder,
  pauseProduction,
  removeConnection,
  startProduction,
} from "../app/game/factory-model.mjs";
import {
  getReliabilityView,
  moveMaintenanceRequest,
  requestMaintenance,
} from "../app/game/maintenance-model.mjs";

const FIXED_SCENARIO_SEEDS = Object.freeze({ 13: 2313, 14: 2414, 15: 2515 });

const COMPACT_ORDER_POSITIONS = Object.freeze({
  source: [1, 6],
  "cutter-1": [1, 2],
  "cutter-2": [1, 10],
  "lathe-1": [6, 2],
  drill: [6, 6],
  "lathe-2": [6, 10],
  coater: [11, 2],
  exit: [11, 6],
  heatTreater: [11, 10],
});

function createCompactOrderDesign(level) {
  let design = createEmptyDesign();
  for (const [id, [gridX, gridY]] of Object.entries(COMPACT_ORDER_POSITIONS)) {
    const type = id.replace(/-\d+$/, "");
    if ((level.deviceLimits[type] ?? 0) === 0) continue;
    design = addDevice(design, type, gridX * 36, gridY * 36, id);
  }
  for (const cutterId of ["cutter-1", "cutter-2"].filter((id) => design.devices[id])) {
    design = connectDevices(design, "source", cutterId, level);
    design = connectDevices(design, cutterId, cutterId.replace("cutter", "lathe"), level);
  }
  for (const latheId of ["lathe-1", "lathe-2"].filter((id) => design.devices[id])) {
    for (const targetId of ["exit", "drill", "coater", "heatTreater"].filter((id) => design.devices[id])) {
      design = connectDevices(design, latheId, targetId, level);
    }
  }
  for (const machineId of ["drill", "coater", "heatTreater"].filter((id) => design.devices[id])) {
    design = connectDevices(design, machineId, "exit", level);
  }
  return design;
}

function createPlayableChapterThreeDesign(level) {
  if (level.id >= 14) return createCompactOrderDesign(level);
  let design = createScenarioValidationDesign(level);
  if (!level.orderConfig && (level.deviceLimits.drill ?? 0) > 0) {
    design = removeConnection(design, "lathe-1->exit");
    design = connectDevices(design, "lathe-1", "drill-1", level);
    design = connectDevices(design, "drill-1", "exit", level);
  }
  return design;
}

test("chapter three exposes five maintenance levels with the approved progression", () => {
  assert.deepEqual(
    Object.values(LEVELS)
      .filter((level) => level.chapter === 3)
      .map((level) => level.id),
    [11, 12, 13, 14, 15],
  );
  assert.equal(LEVELS[11].mode, "production");
  assert.equal(LEVELS[12].mode, "production");
  assert.equal(LEVELS[13].mode, "orderScheduling");
  assert.deepEqual(LEVELS[13].orderConfig.productPool, [
    "standard",
    "precision",
    "hardened",
    "hardened",
  ]);
  assert.equal(LEVELS[15].target, 12);
});

test("chapter three fixed and scenario-validation layouts have no collisions", () => {
  for (const levelId of [11, 12, 13, 14, 15]) {
    const level = LEVELS[levelId];
    const design = createPlayableChapterThreeDesign(level);
    const devices = Object.values(design.devices);
    let placed = createEmptyDesign();

    for (const device of devices) {
      assert.equal(
        canPlaceDevice(placed, level, device),
        true,
        `${device.id} must be legally placeable`,
      );
      placed = addDevice(placed, device.type, device.x, device.y, device.id);
      assert.equal(
        level.obstacles.some(
          (obstacle) => obstacle.gridX === device.gridX && obstacle.gridY === device.gridY,
        ),
        false,
        `${device.id} must not be placed on an obstacle`,
      );
    }
    for (const [index, device] of devices.entries()) {
      for (const other of devices.slice(index + 1)) {
        assert.equal(
          Math.abs(device.gridX - other.gridX) * 36 < 154 &&
            Math.abs(device.gridY - other.gridY) * 36 < 132,
          false,
          `${device.id} and ${other.id} must not overlap`,
        );
      }
    }
  }
});

function enqueueWaitingOrdersByDeadline(state) {
  let next = state;
  const waiting = next.orders
    .filter((order) => order.status === "waiting")
    .sort((left, right) => left.deadlineAt - right.deadlineAt || left.id.localeCompare(right.id));
  for (const order of waiting) next = enqueueProductionOrder(next, order.id);

  const orderedQueue = next.queue
    .map((orderId) => next.orders.find((order) => order.id === orderId))
    .sort((left, right) => left.deadlineAt - right.deadlineAt || left.id.localeCompare(right.id));
  for (const [index, order] of orderedQueue.entries()) {
    next = moveProductionOrder(next, order.id, index);
  }
  return next;
}

function remainingCycles(state, design, level, machineId) {
  return getReliabilityView(
    state.machines[machineId],
    design.devices[machineId].type,
    level,
  ).remainingCycles;
}

function orderMaintenanceQueueByRisk(state, design, level) {
  let next = state;
  const jobs = [...(next.maintenance?.queue ?? [])].sort((left, right) =>
    remainingCycles(next, design, level, left.machineId)
      - remainingCycles(next, design, level, right.machineId)
      || left.machineId.localeCompare(right.machineId));
  for (const [index, job] of jobs.entries()) {
    next = moveMaintenanceRequest(next, job.machineId, index);
  }
  return next;
}

function scheduleOrderLevelMaintenance(state, design, level) {
  let next = state;
  for (const [machineId, machine] of Object.entries(next.machines)) {
    if (machine.reliability?.status !== "available") continue;
    const view = getReliabilityView(machine, design.devices[machineId].type, level);
    if (view.band === "warning" && view.remainingCycles === 1) {
      next = requestMaintenance(next, machineId, level);
    }
  }
  return orderMaintenanceQueueByRisk(next, design, level);
}

function scheduleFixedLevelMaintenance(state, design, level) {
  let next = state;
  for (const [machineId, machine] of Object.entries(next.machines)) {
    if (machine.reliability?.status !== "available") continue;
    const view = getReliabilityView(machine, design.devices[machineId].type, level);
    const isLevelElevenLathe = level.id === 11 && design.devices[machineId].type === "lathe";
    if (view.band === "warning" && (isLevelElevenLathe || view.remainingCycles <= 3)) {
      next = requestMaintenance(next, machineId, level);
    }
  }
  return orderMaintenanceQueueByRisk(next, design, level);
}

function simulateChapterThreeLevel(levelId) {
  const level = LEVELS[levelId];
  const design = createPlayableChapterThreeDesign(level);
  const scenario = level.orderConfig
    ? createOrderScenario(levelId, FIXED_SCENARIO_SEEDS[levelId])
    : undefined;
  let state = startProduction(createProductionState(design, level, scenario), {
    edited: false,
    design,
    level,
  });
  while (state.mode === "running" && state.elapsed < level.duration) {
    state = advanceProduction(state, design, level, level.step);
    if (level.orderConfig) {
      state = enqueueWaitingOrdersByDeadline(state);
      state = scheduleOrderLevelMaintenance(state, design, level);
    } else {
      state = scheduleFixedLevelMaintenance(state, design, level);
    }
  }
  return { design, scenario, state };
}

function simulateWithoutPlannedMaintenance(levelId) {
  const level = LEVELS[levelId];
  const design = createPlayableChapterThreeDesign(level);
  const scenario = level.orderConfig
    ? createOrderScenario(levelId, FIXED_SCENARIO_SEEDS[levelId])
    : undefined;
  let state = startProduction(createProductionState(design, level, scenario), {
    edited: false,
    design,
    level,
  });
  while (state.mode === "running" && state.elapsed < level.duration) {
    state = advanceProduction(state, design, level, level.step);
    if (level.orderConfig) state = enqueueWaitingOrdersByDeadline(state);
  }
  return state;
}

function simulateLevelTwelveWithoutQueueReorder() {
  const level = LEVELS[12];
  const design = createPlayableChapterThreeDesign(level);
  let state = startProduction(createProductionState(design, level), {
    edited: false,
    design,
    level,
  });
  while (state.mode === "running" && state.elapsed < level.duration) {
    state = advanceProduction(state, design, level, level.step);
    for (const [machineId, machine] of Object.entries(state.machines)) {
      if (machine.reliability?.status !== "available") continue;
      const view = getReliabilityView(machine, design.devices[machineId].type, level);
      if (view.band === "warning" && view.remainingCycles <= 3) {
        state = requestMaintenance(state, machineId, level);
      }
    }
  }
  return state;
}

test("every chapter-three level rejects a zero-planned-maintenance baseline", () => {
  for (const levelId of [11, 12, 13, 14, 15]) {
    const state = simulateWithoutPlannedMaintenance(levelId);
    assert.equal(state.mode, "failure", `level ${levelId} must require reliability work`);
    assert.equal(state.maintenance.plannedCompleted, 0);
  }
});

test("level twelve does not pass when two maintenances finish without a queue reorder", () => {
  const state = simulateLevelTwelveWithoutQueueReorder();

  assert.equal(state.maintenance.plannedCompleted >= 2, true);
  assert.equal(state.maintenance.queueReorders, 0);
  assert.equal(state.completed, LEVELS[12].target);
  assert.equal(state.warning, "维护目标未完成");
  assert.equal(state.mode, "failure");
});

test("levels eleven through fifteen complete with legal layouts and at least fifteen percent slack", () => {
  const results = [];
  for (const levelId of [11, 12, 13, 14, 15]) {
    const level = LEVELS[levelId];
    const { scenario, state } = simulateChapterThreeLevel(levelId);
    const relevantLimit = scenario
      ? Math.max(...scenario.orders.map((order) => order.deadlineAt))
      : level.duration;
    const slackRatio = (relevantLimit - state.elapsed) / relevantLimit;
    results.push({ levelId, elapsed: state.elapsed, relevantLimit, slackRatio });

    assert.equal(
      state.mode,
      "success",
      `level ${levelId}: ${JSON.stringify({
        elapsed: state.elapsed,
        completed: state.completed,
        warning: state.warning,
        failure: state.failure,
        orders: state.orders,
        maintenance: state.maintenance,
        machines: state.machines,
        lines: state.lines,
      })}`,
    );
    assert.equal(state.completed, level.target);
  }
  assert.equal(
    results.every((result) => result.slackRatio >= 0.15),
    true,
    JSON.stringify(results),
  );
  assert.deepEqual(results, [
    { levelId: 11, elapsed: 40.52, relevantLimit: 58, slackRatio: 0.3013793103448275 },
    { levelId: 12, elapsed: 49.08, relevantLimit: 68, slackRatio: 0.2782352941176471 },
    { levelId: 13, elapsed: 51.45, relevantLimit: 61, slackRatio: 0.15655737704918027 },
    { levelId: 14, elapsed: 58, relevantLimit: 70, slackRatio: 0.17142857142857143 },
    { levelId: 15, elapsed: 67, relevantLimit: 79, slackRatio: 0.1518987341772152 },
  ]);
});

function finishLevelFifteenAttempt(state, design, level) {
  let next = state;
  while (next.mode === "running" && next.elapsed < level.duration) {
    next = advanceProduction(next, design, level, level.step);
    next = enqueueWaitingOrdersByDeadline(next);
    next = scheduleOrderLevelMaintenance(next, design, level);
  }
  return next;
}

function simulateLevelFifteenRecoveryBranches() {
  const level = LEVELS[15];
  const design = createPlayableChapterThreeDesign(level);
  const scenario = createOrderScenario(15, FIXED_SCENARIO_SEEDS[15]);
  let state = startProduction(createProductionState(design, level, scenario), {
    edited: false,
    design,
    level,
  });
  const evaluatedBranchPoints = new Set();

  while (state.mode === "running" && state.elapsed < level.duration) {
    state = advanceProduction(state, design, level, level.step);
    state = enqueueWaitingOrdersByDeadline(state);

    if (!state.maintenance.activeJob && state.maintenance.queue.length === 0) {
      const highRisk = Object.entries(state.machines).find(([machineId, machine]) => {
        if (machine.reliability?.status !== "available" || machine.active) return false;
        const view = getReliabilityView(machine, design.devices[machineId].type, level);
        return view.band === "warning";
      });
      const lowRisk = Object.entries(state.machines)
        .filter(([machineId, machine]) =>
          machine.reliability?.status === "available"
            && machineId !== highRisk?.[0]
            && machine.active
            && machine.remaining > 2.01)
        .sort(([leftId, left], [rightId, right]) =>
          right.remaining - left.remaining || leftId.localeCompare(rightId))[0];

      if (highRisk && lowRisk
        && remainingCycles(state, design, level, lowRisk[0])
          > remainingCycles(state, design, level, highRisk[0])) {
        const branchKey = `${highRisk[0]}:${highRisk[1].reliability.wear}:${lowRisk[0]}:${lowRisk[1].active?.orderId}`;
        if (evaluatedBranchPoints.has(branchKey)) {
          state = scheduleOrderLevelMaintenance(state, design, level);
          continue;
        }
        evaluatedBranchPoints.add(branchKey);
        const mistakenAt = state.elapsed;
        let mistakenState = requestMaintenance(state, lowRisk[0], level);
        mistakenState = requestMaintenance(mistakenState, highRisk[0], level);
        const mistakenQueue = mistakenState.maintenance.queue.map((job) => job.machineId);

        let immediate = moveMaintenanceRequest(structuredClone(mistakenState), highRisk[0], 0);
        let delayed = advanceProduction(structuredClone(mistakenState), design, level, 2);
        const delayedCrewAfterTwoSeconds = delayed.maintenance.activeJob;
        const delayedQueueAfterTwoSeconds = delayed.maintenance.queue.map((job) => job.machineId);
        delayed = moveMaintenanceRequest(delayed, highRisk[0], 0);
        const correctedQueue = delayed.maintenance.queue.map((job) => job.machineId);

        immediate = advanceProduction(immediate, design, level, 2);
        const immediateCrewAfterTwoSeconds = immediate.maintenance.activeJob;
        immediate = enqueueWaitingOrdersByDeadline(immediate);
        delayed = enqueueWaitingOrdersByDeadline(delayed);

        const immediateFinished = finishLevelFifteenAttempt(immediate, design, level);
        const delayedFinished = finishLevelFifteenAttempt(delayed, design, level);
        if (immediateFinished.mode === "success"
          && delayedFinished.mode === "success"
          && delayedFinished.elapsed > immediateFinished.elapsed) return {
          scenario,
          immediate: immediateFinished,
          delayed: delayedFinished,
          evidence: {
            mistakenAt,
            correctedAt: delayed.elapsed,
            lowRiskMachineId: lowRisk[0],
            highRiskMachineId: highRisk[0],
            lowRiskRemainingAtMistake: lowRisk[1].remaining,
            lowRiskCyclesAtMistake: remainingCycles(state, design, level, lowRisk[0]),
            highRiskCyclesAtMistake: remainingCycles(state, design, level, highRisk[0]),
            highRiskReadyForMaintenanceAtMistake: !highRisk[1].active,
            crewIdleAtMistake: state.maintenance.activeJob === null,
            mistakenQueue,
            delayedCrewAfterTwoSeconds,
            delayedQueueAfterTwoSeconds,
            lowRiskStillActiveAfterTwoSeconds: Boolean(delayed.machines[lowRisk[0]].active),
            correctedQueue,
            immediateCrewAfterTwoSeconds,
          },
        };
      }
    }

    state = scheduleOrderLevelMaintenance(state, design, level);
  }
  throw new Error("The fixed scenario never reached a legal FIFO recovery branch point.");
}

test("level fifteen survives two seconds of real FIFO crew idling before the player corrects the queue", () => {
  const { scenario, immediate, delayed, evidence } = simulateLevelFifteenRecoveryBranches();

  assert.equal(evidence.correctedAt - evidence.mistakenAt, 2);
  assert.equal(evidence.crewIdleAtMistake, true);
  assert.ok(evidence.lowRiskRemainingAtMistake > 2);
  assert.ok(evidence.lowRiskCyclesAtMistake > evidence.highRiskCyclesAtMistake);
  assert.equal(evidence.highRiskReadyForMaintenanceAtMistake, true);
  assert.deepEqual(evidence.mistakenQueue, [evidence.lowRiskMachineId, evidence.highRiskMachineId]);
  assert.equal(evidence.delayedCrewAfterTwoSeconds, null);
  assert.deepEqual(evidence.delayedQueueAfterTwoSeconds, evidence.mistakenQueue);
  assert.equal(evidence.lowRiskStillActiveAfterTwoSeconds, true);
  assert.deepEqual(evidence.correctedQueue, [evidence.highRiskMachineId, evidence.lowRiskMachineId]);
  assert.equal(evidence.immediateCrewAfterTwoSeconds?.machineId, evidence.highRiskMachineId);
  assert.equal(immediate.mode, "success", JSON.stringify(immediate.failure));
  assert.equal(delayed.mode, "success", JSON.stringify(delayed.failure));
  assert.equal(immediate.completed, scenario.orders.length);
  assert.equal(delayed.completed, scenario.orders.length);
  assert.ok(delayed.elapsed > immediate.elapsed);
  assert.deepEqual({
    immediateElapsed: immediate.elapsed,
    delayedElapsed: delayed.elapsed,
    completionLoss: Number((delayed.elapsed - immediate.elapsed).toFixed(2)),
    evidence: {
      mistakenAt: evidence.mistakenAt,
      correctedAt: evidence.correctedAt,
      lowRiskMachineId: evidence.lowRiskMachineId,
      highRiskMachineId: evidence.highRiskMachineId,
      lowRiskRemainingAtMistake: evidence.lowRiskRemainingAtMistake,
    },
  }, {
    immediateElapsed: 67,
    delayedElapsed: 68.05,
    completionLoss: 1.05,
    evidence: {
      mistakenAt: 37.5,
      correctedAt: 39.5,
      lowRiskMachineId: "lathe-2",
      highRiskMachineId: "lathe-1",
      lowRiskRemainingAtMistake: 3,
    },
  });
});

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
  assert.deepEqual(state.maintenance, {
    activeJob: null,
    queue: [],
    plannedCompleted: 0,
    queueReorders: 0,
  });
  assert.equal("reliability" in createProductionState(design, LEVELS[1]).machines.lathe, false);
});

test("editing a paused level-eleven layout restarts with complete pristine reliability state", () => {
  const level = LEVELS[11];
  const design = createPlayableChapterThreeDesign(level);
  let running = startProduction(createProductionState(design, level), {
    edited: false,
    design,
    level,
  });
  running = advanceProduction(running, design, level, 10);
  running.machines["lathe-1"].reliability.wear = 100;
  const paused = pauseProduction(running);

  const restarted = startProduction(paused, { edited: true, design, level });

  assert.equal(restarted.mode, "running");
  assert.equal(restarted.elapsed, 0);
  assert.equal(restarted.completed, 0);
  assert.deepEqual(restarted.maintenance, {
    activeJob: null,
    queue: [],
    plannedCompleted: 0,
    queueReorders: 0,
  });
  assert.ok(Object.values(restarted.machines).every(
    (machine) => machine.reliability?.wear === 0 && machine.reliability.status === "available",
  ));
  assert.doesNotThrow(() => advanceProduction(restarted, design, level, 20));
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
  assert.equal(started.machines.lathe.totalDuration, 3.6);
});
