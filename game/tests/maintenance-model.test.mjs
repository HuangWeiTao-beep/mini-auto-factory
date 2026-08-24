import assert from "node:assert/strict";
import test from "node:test";
import {
  applyCompletedMachineCycle,
  advanceMaintenance,
  canMachineAcceptMaterial,
  cancelMaintenanceRequest,
  createMachineReliability,
  createMaintenanceState,
  getMaintenanceJobView,
  getProcessingDuration,
  getReliabilityView,
  moveMaintenanceRequest,
  requestMaintenance,
} from "../app/game/maintenance-model.mjs";

const level = {
  maintenance: {
    plannedDuration: 4,
    repairDuration: 7,
    slowdownThreshold: 85,
    failureThreshold: 100,
    wearPerCycle: { lathe: 18, drill: 12 },
  },
};

function runtimeWithMachines(ids) {
  const machines = Object.fromEntries(ids.map((id) => [id, {
    active: null,
    output: null,
    reliability: createMachineReliability(),
  }]));
  return { machines, maintenance: createMaintenanceState() };
}

test("reliability bands and locked processing duration follow exact thresholds", () => {
  const machine = { reliability: createMachineReliability() };
  machine.reliability.wear = 59;
  assert.equal(getReliabilityView(machine, "lathe", level).band, "normal");
  machine.reliability.wear = 60;
  assert.deepEqual(getReliabilityView(machine, "lathe", level), {
    band: "warning", wear: 60, remainingCycles: 3,
  });
  machine.reliability.wear = 84;
  assert.equal(getProcessingDuration(machine, 3, level), 3);
  machine.reliability.wear = 85;
  assert.equal(getReliabilityView(machine, "lathe", level).band, "danger");
  assert.equal(getProcessingDuration(machine, 3, level), 3.6);
  machine.reliability.wear = 100;
  assert.equal(getReliabilityView(machine, "lathe", level).band, "failed");
  assert.equal(getReliabilityView(machine, "lathe", level).remainingCycles, 0);
});

test("request, cancel, and move preserve immutable state boundaries", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  const requested = requestMaintenance(state, "lathe", level);
  assert.notEqual(requested, state);
  assert.equal(state.machines.lathe.reliability.status, "available");
  assert.equal(requested.machines.lathe.reliability.status, "maintenance-pending");
  assert.deepEqual(requested.maintenance.queue, [{ machineId: "lathe", kind: "planned", remaining: 4 }]);
  const moved = requestMaintenance(requested, "drill", level);
  const reordered = moveMaintenanceRequest(moved, "drill", 0);
  assert.deepEqual(reordered.maintenance.queue.map((job) => job.machineId), ["drill", "lathe"]);
  assert.equal(reordered.maintenance.queueReorders, 1);
  const cancelled = cancelMaintenanceRequest(reordered, "drill");
  assert.equal(cancelled.machines.drill.reliability.status, "available");
  assert.deepEqual(cancelled.maintenance.queue.map((job) => job.machineId), ["lathe"]);
});

test("a planned job that reaches failure cannot be cancelled into a free available machine", () => {
  const state = runtimeWithMachines(["lathe"]);
  state.machines.lathe.reliability.wear = 90;
  const requested = requestMaintenance(state, "lathe", level);

  applyCompletedMachineCycle(requested, "lathe", "lathe", level);
  const cancelled = cancelMaintenanceRequest(requested, "lathe");

  assert.strictEqual(cancelled, requested);
  assert.equal(cancelled.machines.lathe.reliability.wear, 100);
  assert.equal(cancelled.machines.lathe.reliability.status, "maintenance-pending");
  assert.equal(canMachineAcceptMaterial(cancelled.machines.lathe), false);
  assert.deepEqual(cancelled.maintenance.queue, [
    { machineId: "lathe", kind: "planned", remaining: 4 },
  ]);
});

test("request rejects machines without an existing reliability record", () => {
  const state = runtimeWithMachines(["lathe"]);
  delete state.machines.lathe.reliability;
  const result = requestMaintenance(state, "lathe", level);
  assert.strictEqual(result, state);
  assert.equal(state.machines.lathe.reliability, undefined);
  assert.deepEqual(state.maintenance.queue, []);
});

test("move reorders any waiting maintenance job, including repair", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  state.maintenance.queue = [
    { machineId: "lathe", kind: "planned", remaining: 4 },
    { machineId: "drill", kind: "repair", remaining: 7 },
  ];
  state.machines.lathe.reliability.status = "maintenance-pending";
  state.machines.drill.reliability.status = "broken";
  const moved = moveMaintenanceRequest(state, "drill", 0);
  assert.deepEqual(moved.maintenance.queue.map((job) => job.machineId), ["drill", "lathe"]);
});

test("one crew preserves queue order and planned maintenance wins at 100 percent", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  state.machines.lathe.active = "blank";
  state.machines.lathe.reliability.wear = 90;
  const requested = requestMaintenance(state, "lathe", level);
  assert.equal(requested.machines.lathe.reliability.status, "maintenance-pending");
  applyCompletedMachineCycle(requested, "lathe", "lathe", level);
  assert.equal(requested.machines.lathe.reliability.wear, 100);
  assert.equal(requested.maintenance.queue[0].kind, "planned");
  requested.machines.lathe.active = null;
  advanceMaintenance(requested, level, 0);
  assert.equal(requested.maintenance.activeJob.machineId, "lathe");
  assert.equal(requested.maintenance.activeJob.remaining, 4);
});

test("unplanned failure enqueues exactly one seven-second repair", () => {
  const state = runtimeWithMachines(["lathe"]);
  state.machines.lathe.reliability.wear = 90;
  applyCompletedMachineCycle(state, "lathe", "lathe", level);
  applyCompletedMachineCycle(state, "lathe", "lathe", level);
  assert.equal(state.machines.lathe.reliability.status, "broken");
  assert.deepEqual(state.maintenance.queue, [
    { machineId: "lathe", kind: "repair", remaining: 7 },
  ]);
});

test("active material delays starting queued maintenance and a new job does not tick immediately", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  const requested = requestMaintenance(requestMaintenance(state, "lathe", level), "drill", level);
  requested.machines.lathe.active = "blank";
  advanceMaintenance(requested, level, 1);
  assert.equal(requested.maintenance.activeJob, null);
  assert.deepEqual(requested.maintenance.queue.map((job) => job.machineId), ["lathe", "drill"]);
  const moved = moveMaintenanceRequest(requested, "drill", 0);
  advanceMaintenance(moved, level, 1);
  assert.equal(moved.maintenance.activeJob.machineId, "drill");
  assert.equal(moved.maintenance.activeJob.remaining, 4);
  advanceMaintenance(moved, level, 1);
  assert.equal(moved.maintenance.activeJob.remaining, 3);
});

test("maintenance completion resets wear and material acceptance follows status", () => {
  const state = runtimeWithMachines(["lathe"]);
  state.machines.lathe.reliability.wear = 90;
  const requested = requestMaintenance(state, "lathe", level);
  requested.machines.lathe.active = null;
  advanceMaintenance(requested, level, 0);
  advanceMaintenance(requested, level, 4);
  assert.equal(requested.machines.lathe.reliability.wear, 0);
  assert.equal(requested.machines.lathe.reliability.status, "available");
  assert.equal(canMachineAcceptMaterial(requested.machines.lathe), true);
  assert.equal(requested.maintenance.plannedCompleted, 1);
  requested.machines.lathe.reliability.status = "broken";
  assert.equal(canMachineAcceptMaterial(requested.machines.lathe), false);
  assert.equal(canMachineAcceptMaterial({}), true);
});

test("maintenance job view exposes queued and active stop-receiving timing", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  state.maintenance.activeJob = { machineId: "lathe", kind: "planned", remaining: 2.5 };
  state.maintenance.queue = [{ machineId: "drill", kind: "repair", remaining: 7 }];

  assert.deepEqual(getMaintenanceJobView(state, "lathe"), {
    machineId: "lathe", kind: "planned", remaining: 2.5, status: "active", queueIndex: -1,
  });
  assert.deepEqual(getMaintenanceJobView(state, "drill"), {
    machineId: "drill", kind: "repair", remaining: 7, status: "queued", queueIndex: 0,
  });
});
