# Mini Factory Chapter Three Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add levels 11–15 with deterministic machine wear, one shared maintenance crew, a hardened-bolt heat-treatment route, and order-aware reliability feedback without changing chapters one and two.

**Architecture:** Keep wear and maintenance queue rules in a new pure `maintenance-model` module, then call that model from the existing factory tick so live play and forecasts share one simulation. Add a small operations-feedback composition layer and dedicated maintenance UI; migrate chapter-specific order seeds to a general save field while preserving v0.2 saves.

**Tech Stack:** Node.js 22.13+, React 19, TypeScript 5.9, Vinext/Vite, Node test runner, ESLint, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-23-mini-factory-chapter-three-reliability-design.md`

## Global Constraints

- Do not add runtime or development dependencies.
- Levels 1–10 must retain their existing processing times, recipes, save behavior, and regression results.
- Wear thresholds are 60% warning, 85% slowdown, and 100% failure; danger processing takes 120% of base duration.
- Planned maintenance lasts 4 seconds; unplanned repair lasts 7 seconds; only one job may be active.
- A processing cycle completes before wear is applied; the cycle that reaches 100% remains valid.
- Running wear, jobs, materials, queues, and timers are never persisted.
- Level 13–15 orders and palette shuffles remain deterministic for a persisted seed.
- Implement every task test-first and commit only the files listed for that task.

---

## File Structure

New focused units:

- `game/app/game/maintenance-model.mjs` and `.d.mts`: reliability state, wear math, maintenance requests, queue movement, and maintenance ticking.
- `game/app/game/maintenance-feedback.mjs` and `.d.mts`: per-machine risk and maintenance recommendation.
- `game/app/game/operations-feedback.mjs` and `.d.mts`: combine scheduling and maintenance recommendations into one radar result.
- `game/app/game/MaintenancePanel.tsx`: current maintenance job and reorderable waiting jobs.
- `game/app/game/OperationsPanel.tsx`: compose maintenance and order panels in the right column.
- `game/tests/maintenance-model.test.mjs`, `maintenance-feedback.test.mjs`, `operations-feedback.test.mjs`, and `chapter-three-production.test.mjs`: pure and integrated regressions.
- `game/e2e/chapter-three-maintenance.spec.ts`: browser acceptance for levels 11–15.

Existing files stay responsible for their current domains: `factory-model` advances production, `order-scheduling` defines products and seeded order tables, `game-save` validates persisted data, `game-session` coordinates user actions, and React components render state.

---

### Task 1: Build the pure maintenance model

**Files:**
- Create: `game/app/game/maintenance-model.mjs`
- Create: `game/app/game/maintenance-model.d.mts`
- Create: `game/tests/maintenance-model.test.mjs`

**Interfaces:**
- Consumes: structural machine records containing `active`, `output`, and optional `reliability`; level objects containing `maintenance`.
- Produces: `createMachineReliability()`, `createMaintenanceState()`, `getReliabilityView(machine, deviceType, level)`, `getProcessingDuration(machine, baseDuration, level)`, `requestMaintenance(state, machineId, level)`, `cancelMaintenanceRequest(state, machineId)`, `moveMaintenanceRequest(state, machineId, nextIndex)`, `applyCompletedMachineCycle(state, machineId, deviceType, level)`, `advanceMaintenance(state, level, delta)` and `canMachineAcceptMaterial(machine)`.
- Mutation contract: request/cancel/move return a cloned state or the unchanged input; `applyCompletedMachineCycle` and `advanceMaintenance` mutate the already-cloned state owned by `advanceProduction`.

- [ ] **Step 1: Write failing wear and duration tests**

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  createMachineReliability,
  getProcessingDuration,
  getReliabilityView,
} from "../app/game/maintenance-model.mjs";

const level = {
  maintenance: {
    plannedDuration: 4,
    repairDuration: 7,
    slowdownThreshold: 85,
    failureThreshold: 100,
    wearPerCycle: { lathe: 18 },
  },
};

test("reliability bands and locked processing duration follow exact thresholds", () => {
  const machine = { reliability: createMachineReliability() };
  machine.reliability.wear = 84;
  assert.deepEqual(getReliabilityView(machine, "lathe", level), {
    band: "warning", wear: 84, remainingCycles: 1,
  });
  assert.equal(getProcessingDuration(machine, 3, level), 3);
  machine.reliability.wear = 85;
  assert.equal(getReliabilityView(machine, "lathe", level).band, "danger");
  assert.equal(getProcessingDuration(machine, 3, level), 3.6);
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run: `cd game && node --test tests/maintenance-model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `maintenance-model.mjs`.

- [ ] **Step 3: Implement reliability math and exported types**

```js
export const createMachineReliability = () => ({ wear: 0, status: "available" });
export const createMaintenanceState = () => ({ activeJob: null, queue: [] });

export function getReliabilityView(machine, deviceType, level) {
  const config = level.maintenance;
  const wear = machine.reliability?.wear ?? 0;
  const rate = config?.wearPerCycle?.[deviceType] ?? 0;
  const remainingCycles = rate > 0
    ? Math.max(0, Math.ceil((config.failureThreshold - wear) / rate))
    : 0;
  const band = wear >= config.failureThreshold ? "failed"
    : wear >= config.slowdownThreshold ? "danger"
    : wear >= 60 ? "warning" : "normal";
  return { band, wear, remainingCycles };
}

export function getProcessingDuration(machine, baseDuration, level) {
  const wear = machine.reliability?.wear ?? 0;
  return level.maintenance && wear >= level.maintenance.slowdownThreshold
    ? Math.round(baseDuration * 1.2 * 1000) / 1000
    : baseDuration;
}
```

Define the matching literal unions and structural state interfaces in `maintenance-model.d.mts`; use `ReliabilityStatus = "available" | "maintenance-pending" | "under-maintenance" | "broken"` and `MaintenanceKind = "planned" | "repair"`.

- [ ] **Step 4: Add failing request, queue, completion, and repair tests**

```js
test("one crew preserves queue order and planned maintenance wins at 100 percent", () => {
  const state = runtimeWithMachines(["lathe", "drill"]);
  state.machines.lathe.active = "blank";
  state.machines.lathe.reliability.wear = 90;
  const requested = requestMaintenance(state, "lathe", level);
  assert.equal(requested.machines.lathe.reliability.status, "maintenance-pending");
  assert.deepEqual(requested.maintenance.queue.map((job) => job.machineId), ["lathe"]);

  applyCompletedMachineCycle(requested, "lathe", "lathe", level);
  assert.equal(requested.machines.lathe.reliability.wear, 100);
  assert.equal(requested.maintenance.queue[0].kind, "planned");
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
```

Add `runtimeWithMachines` in the test file with idle machines, reliability from `createMachineReliability`, and maintenance from `createMaintenanceState`.

- [ ] **Step 5: Implement request and tick transitions**

Implement these exact rules:

```js
export function canMachineAcceptMaterial(machine) {
  return !machine.reliability || machine.reliability.status === "available";
}
```

`requestMaintenance` accepts only an existing machine with `available` reliability and a non-null level maintenance config, sets `maintenance-pending`, and appends one `{ machineId, kind: "planned", remaining: 4 }`. `cancelMaintenanceRequest` removes only a waiting planned job and restores `available`. `moveMaintenanceRequest` clamps the requested index. `advanceMaintenance` decrements only the job that was active at the start of the tick; after completion it resets wear to zero, restores `available`, then starts the first queued job whose machine has no active material. A newly started job is not decremented until the next tick.

- [ ] **Step 6: Verify and commit**

Run: `cd game && node --test tests/maintenance-model.test.mjs`

Expected: all maintenance-model tests PASS.

```powershell
git add game/app/game/maintenance-model.mjs game/app/game/maintenance-model.d.mts game/tests/maintenance-model.test.mjs
git commit -m "feat: add machine maintenance model"
```

---

### Task 2: Add the hardened product and heat-treatment device

**Files:**
- Modify: `game/app/game/order-scheduling.mjs:1-46`
- Modify: `game/app/game/order-scheduling.d.mts:1-32`
- Modify: `game/app/game/factory-model.mjs:18-44, 809-837`
- Modify: `game/app/game/factory-model.d.mts:1-45`
- Modify: `game/tests/order-scheduling.test.mjs`
- Modify: `game/tests/chapter-two-production.test.mjs`

**Interfaces:**
- Consumes: existing `PRODUCTS`, `DEVICE_TYPES`, `PROCESSING_TYPES`, `MATERIALS`, `orderMaterialOutput`, and recipe routing.
- Produces: `ProductId` value `"hardened"`, device type `"heatTreater"`, material type `"hardenedBolt"`, and route `source → cutter → lathe → heatTreater → exit`.

- [ ] **Step 1: Write failing catalog tests**

```js
test("hardened bolts use the heat-treatment route", () => {
  assert.deepEqual(PRODUCTS.hardened.route, [
    "source", "cutter", "lathe", "heatTreater", "exit",
  ]);
  assert.equal(DEVICE_TYPES.heatTreater.label, "热处理炉");
  assert.equal(DEVICE_TYPES.heatTreater.accepts, "bolt");
  assert.equal(DEVICE_TYPES.heatTreater.produces, "hardenedBolt");
  assert.equal(MATERIALS.hardenedBolt.label, "强化螺栓");
});
```

- [ ] **Step 2: Verify the catalog test fails**

Run: `cd game && node --test tests/order-scheduling.test.mjs`

Expected: FAIL because `PRODUCTS.hardened` is undefined.

- [ ] **Step 3: Add the product, device, material, and declarations**

```js
const PRODUCT_ROUTE_HARDENED = Object.freeze([
  "source", "cutter", "lathe", "heatTreater", "exit",
]);

hardened: Object.freeze({
  id: "hardened",
  label: "强化螺栓",
  ariaLabel: "强化螺栓订单",
  colorToken: "order-hardened",
  route: PRODUCT_ROUTE_HARDENED,
}),
```

Add `heatTreater` to `DEVICE_TYPES` with label `热处理炉`, input `bolt`, output `hardenedBolt`, base duration `3`, icon `♨`, eyebrow `HEAT 06`; add it to `PROCESSING_TYPES`. Extend `orderMaterialOutput` with `heatTreater: "hardenedBolt"` and update both declaration files' unions and records.

- [ ] **Step 4: Add a wrong-route and correct-route model test**

Create a custom order scenario containing one hardened order. Assert that `lathe → exit` produces a route warning and zero completions, while `lathe → heatTreater → exit` completes the order. Reuse the existing `createScenario`, `addNamedDevice`, `startScenario`, and `advanceProduction` helpers in `chapter-two-production.test.mjs`.

- [ ] **Step 5: Run regression tests and commit**

Run: `cd game && node --test tests/order-scheduling.test.mjs tests/chapter-two-production.test.mjs`

Expected: both files PASS, including all three v0.2 product routes.

```powershell
git add game/app/game/order-scheduling.mjs game/app/game/order-scheduling.d.mts game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/tests/order-scheduling.test.mjs game/tests/chapter-two-production.test.mjs
git commit -m "feat: add hardened bolt production route"
```

---

### Task 3: Integrate maintenance into the shared production simulation

**Files:**
- Modify: `game/app/game/factory-model.mjs:46-78, 439-484, 699-1002, 1039-1132`
- Modify: `game/app/game/factory-model.d.mts:27-135`
- Modify: `game/tests/factory-model.test.mjs`
- Create: `game/tests/chapter-three-production.test.mjs`

**Interfaces:**
- Consumes: all Task 1 maintenance exports and the Task 2 `heatTreater` route.
- Produces: optional `LevelConfig.maintenance`, `isMaintenanceLevel(levelOrId)`, optional `machine.reliability`, optional `ProductionState.maintenance`, and maintenance-aware live/forecast ticks.

- [ ] **Step 1: Write a failing state-initialization test**

```js
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

test("maintenance levels initialize reliability without changing old levels", () => {
  const design = straightLineDesign(maintenanceLevel);
  const state = createProductionState(design, maintenanceLevel);
  assert.deepEqual(state.machines.lathe.reliability, { wear: 0, status: "available" });
  assert.deepEqual(state.maintenance, { activeJob: null, queue: [] });
  assert.equal("reliability" in createProductionState(design, LEVELS[1]).machines.lathe, false);
});
```

- [ ] **Step 2: Run the new test and verify failure**

Run: `cd game && node --test tests/chapter-three-production.test.mjs`

Expected: FAIL because production state has no reliability data.

- [ ] **Step 3: Extend level freezing, types, and state creation**

Add `maintenance: null` to levels 1–10 through `freezeLevel`; when present, freeze `wearPerCycle`. Extend `chapter` to `1 | 2 | 3`. `isMaintenanceLevel` returns true only when `level.maintenance` is non-null. In `createProductionState`, add reliability to processing machines and global maintenance only for maintenance levels.

- [ ] **Step 4: Write failing integration tests for wear, slowdown, blocking, and recovery**

```js
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
  assert.ok(Object.values(state.lines).some((line) => line.item?.status === "waiting"));
});
```

Define `straightLineDesign`, `runningStraightLineState`, `advanceUntil`, and `stateOneCycleFromFailure` in `chapter-three-production.test.mjs`. `advanceUntil` advances by `level.step` with a 20-second hard limit and throws if the predicate never becomes true; it must not hide a stalled simulation.

- [ ] **Step 5: Route all machine starts and completions through maintenance hooks**

Add a `beginMachineWork(machine, material, deviceType, level)` helper and use it in normal delivery, order delivery, and waiting-slot promotion so duration is locked by `getProcessingDuration` at job start. Call `applyCompletedMachineCycle` immediately after each normal or order machine completes. Reject new delivery when `canMachineAcceptMaterial(machine)` is false, while preserving a previously occupied waiting slot.

Call `advanceMaintenance` at the end of both normal and order ticks. This makes a maintenance completion usable on the next logical step and automatically applies to `forecastOrderCompletionTimes`, which already calls the order tick.

- [ ] **Step 6: Run regressions and commit**

Run: `cd game && node --test tests/maintenance-model.test.mjs tests/factory-model.test.mjs tests/chapter-two-production.test.mjs tests/chapter-three-production.test.mjs`

Expected: all tests PASS and levels 1–10 produce their previous results.

```powershell
git add game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/tests/factory-model.test.mjs game/tests/chapter-three-production.test.mjs
git commit -m "feat: integrate maintenance with production"
```

---

### Task 4: Define levels 11–15 and feasible seeded scenarios

**Files:**
- Modify: `game/app/game/order-scheduling.mjs:37-92`
- Modify: `game/app/game/factory-model.mjs:55-314, 514-648`
- Modify: `game/app/game/factory-model.d.mts:28-69`
- Modify: `game/tests/order-scheduling.test.mjs`
- Modify: `game/tests/chapter-three-production.test.mjs`

**Interfaces:**
- Consumes: `ORDER_SCENARIO_RULES`, `LEVELS`, scenario validation helpers, maintenance request/move functions.
- Produces: exact level configs 11–15, seeded rules 13–15, validation placement for `heatTreater-1`, and a supported automatic maintenance policy used only to reject impossible scenario seeds.

- [ ] **Step 1: Add failing level-definition tests**

```js
test("chapter three exposes five maintenance levels with the approved progression", () => {
  assert.deepEqual(Object.values(LEVELS).filter((level) => level.chapter === 3).map((level) => level.id), [11, 12, 13, 14, 15]);
  assert.equal(LEVELS[11].mode, "production");
  assert.equal(LEVELS[12].mode, "production");
  assert.equal(LEVELS[13].mode, "orderScheduling");
  assert.deepEqual(LEVELS[13].orderConfig.productPool, ["standard", "precision", "hardened", "hardened"]);
  assert.equal(LEVELS[15].target, 12);
});
```

- [ ] **Step 2: Verify missing levels fail**

Run: `cd game && node --test tests/chapter-three-production.test.mjs`

Expected: FAIL because `LEVELS[11]` is undefined.

- [ ] **Step 3: Add exact initial level and wear configuration**

Use the spec's durations, order counts, arrival windows, and deadline windows. Use these initial `wearPerCycle` values:

```js
11: { cutter: 8, lathe: 18 },
12: { cutter: 10, lathe: 14, drill: 18 },
13: { cutter: 13, lathe: 15, drill: 25, heatTreater: 40 },
14: { cutter: 12, lathe: 14, drill: 24, coater: 28, heatTreater: 38 },
15: { cutter: 13, lathe: 15, drill: 25, coater: 30, heatTreater: 40 },
```

Every maintenance config uses planned `4`, repair `7`, slowdown `85`, failure `100`. Level 13's product pool contains hardened twice so all valid seeds exercise the furnace. Levels 14–15 use all four products once per pool cycle.

- [ ] **Step 4: Extend scenario validation for the new route and maintenance**

Add `heatTreater-1: [16, 10]` to validation positions and include heat-treatment connections. During scenario validation, after each tick:

1. enqueue waiting orders by earliest deadline;
2. request maintenance for every available machine at warning band with one or fewer safe cycles after the current one;
3. sort waiting maintenance jobs by `remainingCycles`, then by machine id;
4. continue until success, failure, or `level.duration`.

This policy is only a feasibility witness; it does not run during player sessions.

- [ ] **Step 5: Add deterministic and feasibility tests**

```js
for (const [levelId, seed] of [[13, 2313], [14, 2414], [15, 2515]]) {
  test(`level ${levelId} scenario is deterministic and contains every configured product`, () => {
    const first = createOrderScenario(levelId, seed);
    const second = createOrderScenario(levelId, seed);
    assert.deepEqual(second, first);
    for (const productId of new Set(LEVELS[levelId].orderConfig.productPool)) {
      assert.ok(first.orders.some((order) => order.productId === productId));
    }
  });
}
```

Also assert levels 11–12 fixed designs and levels 13–15 validation designs have no overlaps or obstacle collisions.

- [ ] **Step 6: Run tests and commit**

Run: `cd game && node --test tests/order-scheduling.test.mjs tests/chapter-two-production.test.mjs tests/chapter-three-production.test.mjs`

Expected: all scenario generation and route tests PASS.

```powershell
git add game/app/game/order-scheduling.mjs game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/tests/order-scheduling.test.mjs game/tests/chapter-three-production.test.mjs
git commit -m "feat: add chapter three level scenarios"
```

---

### Task 5: Migrate saves and sessions to general order scenario seeds

**Files:**
- Modify: `game/app/game/game-save.mjs:1-169`
- Modify: `game/app/game/game-save.d.mts:1-44`
- Modify: `game/app/game/game-session.mjs:1-251`
- Modify: `game/app/game/game-session.d.mts:1-85`
- Modify: `game/app/game/useGameSession.ts:1-188`
- Modify: `game/tests/game-save.test.mjs`
- Modify: `game/tests/game-session.test.mjs`

**Interfaces:**
- Consumes: v1/v2 save shapes and `isOrderSchedulingLevel`.
- Produces: save version `3`, `orderScenarioSeeds: Record<number, number>`, `generateOrderScenarioSeed`, unlock ceiling 15, and fresh maintenance state on restore.

- [ ] **Step 1: Write failing v2 migration tests**

```js
test("version two chapter seeds migrate without losing progress", () => {
  const legacy = {
    version: 2,
    unlockedLevel: 10,
    activeLevelId: 10,
    bestResults: { 10: { elapsed: 73.4, completed: 12 } },
    drafts: { 10: { devices: {}, connections: [] } },
    chapterTwoSeeds: { 6: 1606, 10: 2010 },
  };
  assert.deepEqual(parseGameSave(JSON.stringify(legacy)), {
    version: 3,
    unlockedLevel: 10,
    activeLevelId: 10,
    bestResults: { 10: { elapsed: 73.4, completed: 12 } },
    drafts: { 10: { devices: {}, connections: [] } },
    orderScenarioSeeds: { 6: 1606, 10: 2010 },
  });
});
```

- [ ] **Step 2: Verify migration test fails**

Run: `cd game && node --test tests/game-save.test.mjs`

Expected: FAIL because `SAVE_VERSION` is 2 and the returned field is `chapterTwoSeeds`.

- [ ] **Step 3: Implement save version 3 and strict seed keys**

Set `MAX_SAVE_LEVEL_ID = 15` and accept seed keys only for `6,7,8,9,10,13,14,15`. Version 1 migrates with empty seeds; version 2 reads `chapterTwoSeeds`; version 3 reads `orderScenarioSeeds`. Version 1–2 saves may not claim unlocks above 10. Serialization writes only the v3 shape.

- [ ] **Step 4: Rename and update session seed flow**

Rename `generateChapterTwoSeed` to `generateOrderScenarioSeed`. Replace every `chapterTwoSeeds` session field and memo dependency with `orderScenarioSeeds`. Generate seeds only for levels whose mode is `orderScheduling`; levels 11–12 never receive one. Ensure `resetGameSession` calls `createProductionState(design, level, scenario)` for every mode so maintenance state is recreated after reset.

- [ ] **Step 5: Add session restore, retry, and unlock tests**

```js
test("chapter three restore keeps the seed but resets live maintenance", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: 3,
    unlockedLevel: 13,
    activeLevelId: 13,
    bestResults: {}, drafts: { 13: draft },
    orderScenarioSeeds: { 13: 2313 },
  });
  const restored = restoreGameSession(storage);
  assert.equal(restored.orderScenarioSeeds[13], 2313);
  assert.deepEqual(restored.state.maintenance, { activeJob: null, queue: [] });
  assert.ok(Object.values(restored.state.machines).every((machine) => machine.reliability.wear === 0));
});

test("level fifteen completion does not unlock level sixteen", () => {
  assert.equal(nextUnlockedLevel(15, 15), 15);
});
```

- [ ] **Step 6: Run tests and commit**

Run: `cd game && node --test tests/game-save.test.mjs tests/game-session.test.mjs`

Expected: all migrations, refresh rules, retries, and unlock boundaries PASS.

```powershell
git add game/app/game/game-save.mjs game/app/game/game-save.d.mts game/app/game/game-session.mjs game/app/game/game-session.d.mts game/app/game/useGameSession.ts game/tests/game-save.test.mjs game/tests/game-session.test.mjs
git commit -m "feat: migrate saves for chapter three"
```

---

### Task 6: Add maintenance actions and the right-side maintenance UI

**Files:**
- Create: `game/app/game/MaintenancePanel.tsx`
- Create: `game/app/game/OperationsPanel.tsx`
- Modify: `game/app/game/MachineCard.tsx:1-121`
- Modify: `game/app/game/FactoryFloor.tsx:1-151`
- Modify: `game/app/game/OrderPanel.tsx:81-215`
- Modify: `game/app/game/MiniFactoryGame.tsx:36-462`
- Modify: `game/app/game/game-session.mjs:205-224`
- Modify: `game/app/game/game-session.d.mts:68-82`
- Modify: `game/app/game/useGameSession.ts:121-188`
- Modify: `game/app/game/game.css:87-164, 178-202`
- Modify: `game/tests/game-session.test.mjs`

**Interfaces:**
- Consumes: Task 1 request/cancel/move functions and Task 5 session shape.
- Produces: `requestSessionMaintenance`, `cancelSessionMaintenance`, `moveSessionMaintenance`, `prioritizeSessionMaintenance`, hook callbacks `requestMaintenance`, `cancelMaintenance`, `moveMaintenanceUp`, `moveMaintenanceDown`, `prioritizeMaintenance`, and stable `data-testid` selectors.

- [ ] **Step 1: Write failing session-action tests**

```js
test("maintenance actions are allowed only while running or paused", () => {
  const runningSession = chapterThreeSession("running");
  const designSession = chapterThreeSession("design");
  const requested = requestSessionMaintenance(runningSession, "lathe");
  assert.notStrictEqual(requested, runningSession);
  assert.equal(requested.state.maintenance.queue[0].machineId, "lathe");
  assert.strictEqual(requestSessionMaintenance(designSession, "lathe"), designSession);
});
```

Define `chapterThreeSession(mode)` in `game-session.test.mjs`; it builds a legal level-11 design, calls `createProductionState(design, LEVELS[11])`, and replaces only the returned mode.

- [ ] **Step 2: Verify the action test fails**

Run: `cd game && node --test tests/game-session.test.mjs`

Expected: FAIL because the session maintenance exports do not exist.

- [ ] **Step 3: Implement session and hook actions**

Each session action reads `LEVELS[session.activeLevelId]`, rejects modes outside `running|paused`, delegates to the maintenance model, and returns the unchanged session on a no-op. `prioritizeSessionMaintenance` moves a waiting job to index `0`. Hook callbacks must read `sessionRef.current`, update both `sessionRef` and React state, and return a boolean indicating whether anything changed.

- [ ] **Step 4: Build the components with exact controls**

`MaintenancePanel` props:

```ts
type Props = {
  design: FactoryDesign;
  state: ProductionState;
  level: LevelConfig;
  actionsEnabled: boolean;
  onCancel: (machineId: string) => boolean;
  onMoveUp: (machineId: string) => boolean;
  onMoveDown: (machineId: string) => boolean;
};
```

Render current job with `data-testid="maintenance-active-${machineId}"`; queued jobs with `maintenance-queue-${machineId}` and buttons `maintenance-up-*`, `maintenance-down-*`, `maintenance-cancel-*`. Show the full production goal when no order panel exists.

`MachineCard` receives `maintenanceActionsEnabled`, `onRequestMaintenance`, and `onCancelMaintenance`. Add text band, percent, remaining cycles, and buttons `maintenance-request-${device.id}` / `maintenance-card-cancel-${device.id}`. Stop click and drag propagation from these buttons.

`OperationsPanel` owns the right column and renders maintenance above orders. Change `OrderPanel`'s root element from `aside` to `section`; keep its order logic unchanged.

When a machine first crosses 60% or 85%, write a short non-modal message into the existing `feedback-bar` live region. A breakdown uses the same bar plus card state; it must not create a dialog.

- [ ] **Step 5: Add layout and state CSS**

Keep the machine footprint within the existing collision box. Add `.workspace--operations`, `.operations-panel`, `.maintenance-panel`, `.maintenance-job`, `.machine__wear`, and reliability state modifiers. Use text labels plus color; do not animate the 60% warning. Add a narrow-width rule that stacks maintenance and orders inside the same scrollable right column.

- [ ] **Step 6: Build, lint, and commit**

Run: `cd game && npm.cmd run build`

Run: `cd game && npm.cmd run lint`

Expected: both commands exit 0; TypeScript accepts every new prop and callback.

```powershell
git add game/app/game/MaintenancePanel.tsx game/app/game/OperationsPanel.tsx game/app/game/MachineCard.tsx game/app/game/FactoryFloor.tsx game/app/game/OrderPanel.tsx game/app/game/MiniFactoryGame.tsx game/app/game/game-session.mjs game/app/game/game-session.d.mts game/app/game/useGameSession.ts game/app/game/game.css game/tests/game-session.test.mjs
git commit -m "feat: add maintenance controls and panel"
```

---

### Task 7: Compose scheduling and maintenance into the operations radar

**Files:**
- Create: `game/app/game/maintenance-feedback.mjs`
- Create: `game/app/game/maintenance-feedback.d.mts`
- Create: `game/app/game/operations-feedback.mjs`
- Create: `game/app/game/operations-feedback.d.mts`
- Create: `game/tests/maintenance-feedback.test.mjs`
- Create: `game/tests/operations-feedback.test.mjs`
- Modify: `game/app/game/MiniFactoryGame.tsx:36-285`
- Modify: `game/app/game/OperationsPanel.tsx`
- Modify: `game/app/game/game.css:110-118`

**Interfaces:**
- Consumes: `getSchedulingFeedback`, `forecastOrderCompletionTimes`, maintenance view/queue operations, and the current 0.5-second cache key.
- Produces: `getMaintenanceFeedback({ state, design, level })` and `getOperationsFeedback({ design, level, state, orders, queue, elapsed, cacheKey })`.

- [ ] **Step 1: Write failing maintenance recommendation tests**

```js
test("dangerous idle furnace recommends scheduling maintenance", () => {
  const input = feedbackState({ machineId: "heat", type: "heatTreater", wear: 88 });
  const feedback = getMaintenanceFeedback(input);
  assert.deepEqual(feedback.recommendation, {
    kind: "scheduleMaintenance",
    machineId: "heat",
    message: "热处理炉还能加工 1 件，建议现在安排维护。",
  });
});

test("a broken machine behind a planned job recommends repair priority", () => {
  const input = queuedRepairState();
  assert.equal(getMaintenanceFeedback(input).recommendation.kind, "prioritizeRepair");
});
```

Define `feedbackState` with one legal device, matching design record, maintenance-enabled level, and initialized production state. Define `queuedRepairState` with an active planned job and one queued repair so the priority result is deterministic.

- [ ] **Step 2: Verify missing feedback modules fail**

Run: `cd game && node --test tests/maintenance-feedback.test.mjs tests/operations-feedback.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement bounded candidate analysis**

Return per-machine wear views plus one recommendation. Evaluate broken machines first, then pending repair order, then machines in danger or with one remaining cycle. Limit hypothetical forecast simulations to the three highest-risk machines, ordered by band, remaining cycles, then id. Use `forecastOrderCompletionTimes` on a cloned state after the candidate maintenance action; do not create an approximate timing formula.

- [ ] **Step 4: Implement operations recommendation priority**

Use this fixed priority:

1. missing product route;
2. broken machine or repair priority;
3. late/danger order action;
4. danger maintenance action;
5. other scheduling recommendation;
6. stable status.

The returned union contains order actions (`enqueue`, `moveToFront`), maintenance actions (`scheduleMaintenance`, `prioritizeRepair`), passive `monitor`, route, and stable. Include `orderId` or `machineId` only when the action needs it.

- [ ] **Step 5: Wire the radar button to existing player actions**

Rename the third-chapter heading to `运营雷达`; chapter two remains `调度雷达`. Map each actionable recommendation to the existing order or maintenance callback; `prioritizeRepair` calls `prioritizeMaintenance(machineId)`. Never execute an action while calculating feedback.

- [ ] **Step 6: Run feedback regressions and commit**

Run: `cd game && node --test tests/scheduling-feedback.test.mjs tests/maintenance-feedback.test.mjs tests/operations-feedback.test.mjs`

Expected: all feedback tests PASS, including existing join-the-front forecasts.

```powershell
git add game/app/game/maintenance-feedback.mjs game/app/game/maintenance-feedback.d.mts game/app/game/operations-feedback.mjs game/app/game/operations-feedback.d.mts game/app/game/MiniFactoryGame.tsx game/app/game/OperationsPanel.tsx game/app/game/game.css game/tests/maintenance-feedback.test.mjs game/tests/operations-feedback.test.mjs
git commit -m "feat: add reliability operations radar"
```

---

### Task 8: Finish chapter navigation, onboarding, and playable balance

**Files:**
- Modify: `game/app/game/LevelSelectModal.tsx:11-24`
- Modify: `game/app/game/MiniFactoryGame.tsx:36-462`
- Modify: `game/app/game/game.css:261-283`
- Modify: `game/tests/chapter-three-production.test.mjs`
- Modify: `game/tests/game-source-contract.test.mjs`
- Modify: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: levels 11–15, maintenance UI, operation feedback, and unlock state.
- Produces: chapter-three map section, level-11 help, correct mission copy for mixed chapter modes, and fixed-seed balance evidence.

- [ ] **Step 1: Write failing chapter-map and copy contract tests**

Assert source contracts contain `第三章：设备可靠性`, level filters 11–15, level-11 help copy, and `CHAPTER THREE`. Assert the order mission is selected with `isOrderSchedulingLevel(level)`, not `level.chapter === 2`, so levels 13–15 show order counts while levels 11–12 show fixed production goals.

- [ ] **Step 2: Implement chapter map and onboarding**

Define chapter ranges as 1–5, 6–10, and 11–15. `levelDetail` uses order windows whenever `orderConfig` exists. Show help controls on levels 1, 6, and 11. The level-11 dialog must explain: cycle wear, 60/85/100 thresholds, finish-current-item maintenance, and one shared crew. It opens once on selecting level 11, not after every refresh.

- [ ] **Step 3: Add full fixed-scenario simulations**

In `chapter-three-production.test.mjs`, build legal layouts for each level. For levels 13–15, enqueue waiting orders by earliest deadline. Request maintenance at warning with one remaining cycle and order queued jobs by remaining cycles. Assert success for seeds 2313, 2414, and 2515.

Add a level-15 recovery test that intentionally puts one lower-risk planned job before a higher-risk job once, advances two seconds, then corrects the queue and still reaches success. This is the executable proof of the agreed single-error margin.

- [ ] **Step 4: Calibrate only configuration values**

If a fixed scenario fails, change only level duration, arrival/deadline windows, source interval, machine duration, or wear-per-cycle configuration. Do not add hidden bonuses, automatic player actions, or special-case seed logic. Record the passing completion time in the assertion and require at least 15% slack against the final relevant deadline/time limit.

- [ ] **Step 5: Run unit, build, and lint gates**

Run: `cd game && npm.cmd test`

Run: `cd game && npx.cmd tsc --noEmit`

Run: `cd game && npm.cmd run lint`

Expected: every command exits 0.

- [ ] **Step 6: Commit the playable chapter shell**

```powershell
git add game/app/game/LevelSelectModal.tsx game/app/game/MiniFactoryGame.tsx game/app/game/game.css game/tests/chapter-three-production.test.mjs game/tests/game-source-contract.test.mjs game/tests/rendered-html.test.mjs
git commit -m "feat: complete chapter three progression"
```

---

### Task 9: Add browser acceptance, documentation, and final verification

**Files:**
- Modify: `game/e2e/helpers.ts`
- Create: `game/e2e/chapter-three-maintenance.spec.ts`
- Modify: `README.md`
- Modify: `game/README.md`

**Interfaces:**
- Consumes: save v3, stable UI test ids, deterministic Playwright clock, all chapter-three routes/actions.
- Produces: reusable `seedChapterThreeLevel`, heat-treatment placement/route helpers, four E2E acceptance flows, and v0.3 documentation.

- [ ] **Step 1: Extend deterministic E2E helpers**

Add `heatTreater` to machine labels, placement points, and product routes. Add fixed seeds `{ 13: 2313, 14: 2414, 15: 2515 }`. `seedChapterThreeLevel` writes save version 3 with `orderScenarioSeeds`; it accepts active/unlocked levels 11–15.

- [ ] **Step 2: Write level 11 and 12 E2E tests**

Level 11 must place the straight line, start production, wait for warning, assert no dialog opens, click `maintenance-request-lathe`, observe `maintenance-active-lathe`, and finish successfully. After dismissing the level-11 guide, refresh once before production and assert the guide does not reopen. Level 12 must queue lathe and drill maintenance, click a queue-up control, and assert the displayed order changes before production succeeds.

- [ ] **Step 3: Write level 13 and 15 E2E tests**

Level 13 must route a hardened order through `.machine--heatTreater`, observe its completed order card, and never show a wrong-route warning. Level 15 must place the legal nine-device layout, connect all four routes, enqueue by the tested schedule, perform at least one planned maintenance, and reach the success dialog.

- [ ] **Step 4: Run the focused E2E file**

Run: `cd game && npx.cmd playwright test e2e/chapter-three-maintenance.spec.ts --workers=1`

Expected: all four chapter-three tests PASS.

- [ ] **Step 5: Update user and developer documentation**

Update both READMEs to v0.3 / three chapters / fifteen levels. Document the four product routes, thresholds, 4-second planned maintenance, 7-second repair, one-crew queue controls, save migration, and manual checks for levels 11, 13, and 15. Remove stale statements that v0.2 is only a release candidate.

- [ ] **Step 6: Run the complete release gate**

Run in `game/`:

```powershell
npm.cmd test
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd run build
npm.cmd run test:e2e
```

Expected: all five commands exit 0. Then run `git diff --check` from the repository root and expect no output.

- [ ] **Step 7: Commit final acceptance coverage and docs**

```powershell
git add game/e2e/helpers.ts game/e2e/chapter-three-maintenance.spec.ts README.md game/README.md
git commit -m "test: verify chapter three reliability flows"
```

- [ ] **Step 8: Stop before publishing**

Report the commit list, automated results, and manual verification commands. Do not push GitHub or deploy ChatGPT Sites until the user separately approves publication after manual acceptance.
