# 迷你自动化工厂第一章 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有单关螺栓教学游戏扩展为包含第 1～5 关、钻孔、并行分流、有限工位和关卡选择的可测试浏览器章节。

**Architecture:** 保留 `factory-model.mjs` 作为确定性模拟核心，但将硬编码的单关常量替换为不可变的关卡配置，并让生产状态按设备 ID 保存源头和加工状态。新增网格工具模块负责吸附、障碍检测和距离运输；React 层只展示模型状态和把玩家操作转换成模型调用。

**Tech Stack:** Next.js 16、React 19、TypeScript、ES modules、Node 内置 `node:test`、Vinext。

## Global Constraints

- 保持桌面浏览器与鼠标拖拽交互；不添加移动端、账号、存档、排行榜或外部服务。
- 关卡 1 的标准流程必须仍在第 36.5 秒完成第 10 件；第 1 关不得要求钻孔机。
- 第 2 关必须在 45 秒内完成 10 件，并将未钻孔螺栓在出口处丢弃且不给完成数。
- 第 3 关必须使用严格轮流的多分支分流；轮到不可用分支时不得跳过。
- 第 4、5 关运输时间使用 `0.5 × max(1, 曼哈顿距离)` 秒；障碍禁止设备放置但不禁止连线。
- 暂停后没有编辑可继续；暂停后有编辑必须从本关完整倒计时重新开始。
- 不引入随机故障、成本、电力、AGV、仓储或第二种产品。

---

## File structure

- `game/app/game/factory-model.mjs`：关卡配置、设计校验和确定性物料模拟。
- `game/app/game/factory-model.d.mts`：模型给 TypeScript UI 使用的精确类型声明。
- `game/app/game/factory-grid.mjs`：画布网格、障碍占位、设备吸附和运输时间计算。
- `game/app/game/factory-grid.d.mts`：网格模块类型声明。
- `game/app/game/MiniFactoryGame.tsx`：关卡选择、设计编辑、运行控制、结算和提示。
- `game/app/game/FactoryFloor.tsx`：障碍、连线时间与物料线路渲染。
- `game/app/game/MachineCard.tsx`：钻孔机、动态机器文案和多分支端口交互。
- `game/app/game/LevelSelectModal.tsx`：关卡选择与解锁状态展示。
- `game/app/game/game.css`：章节选择、障碍、分支标签与运输时间样式。
- `game/tests/factory-model.test.mjs`：每关节拍、质量、分流、结算和暂停回归测试。
- `game/tests/factory-grid.test.mjs`：网格吸附、障碍与距离测试。
- `game/tests/game-source-contract.test.mjs`、`game/tests/rendered-html.test.mjs`：界面契约和服务端渲染壳测试。

## Task 1: Define level data and grid utilities

**Files:**
- Create: `game/app/game/factory-grid.mjs`
- Create: `game/app/game/factory-grid.d.mts`
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/app/game/factory-model.d.mts`
- Test: `game/tests/factory-grid.test.mjs`
- Test: `game/tests/factory-model.test.mjs`

**Interfaces:**
- Produces `LEVELS[levelId]`, `getLevelConfig(levelId)`, `getDeviceLimit(level, type)`, `getTransportDuration(level, from, to)` and `nextUnlockedLevel(unlockedLevel, completedLevelId)`.
- Produces `snapToGrid(x, y)`, `isObstaclePlacement(level, cell)` and `manhattanDistance(from, to)`.
- Later tasks consume `LevelConfig`, `DeviceType`, `GridCell` and level-aware `connectDevices(design, from, to, level)`.

- [ ] **Step 1: Add failing grid and configuration tests**

```js
import {
  isObstaclePlacement,
  manhattanDistance,
  snapToGrid,
} from "../app/game/factory-grid.mjs";
import { LEVELS, getTransportDuration } from "../app/game/factory-model.mjs";

test("level four uses grid distance while level two keeps fixed transport", () => {
  assert.equal(getTransportDuration(LEVELS[2], { gridX: 1, gridY: 1 }, { gridX: 8, gridY: 4 }), 0.5);
  assert.equal(getTransportDuration(LEVELS[4], { gridX: 1, gridY: 1 }, { gridX: 8, gridY: 4 }), 5);
});

test("grid helpers snap positions and reject only obstacle placement", () => {
  assert.deepEqual(snapToGrid(74, 109), { gridX: 2, gridY: 3 });
  assert.equal(isObstaclePlacement(LEVELS[4], { gridX: 7, gridY: 3 }), true);
  assert.equal(manhattanDistance({ gridX: 1, gridY: 1 }, { gridX: 4, gridY: 3 }), 5);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm test -- --test-name-pattern="grid|transport"` from `game`.

Expected: FAIL because the grid module and level-aware transport API do not exist.

- [ ] **Step 3: Implement immutable level configuration and grid helpers**

```js
export const GRID = { cellSize: 36, columns: 24, rows: 14 };

export function manhattanDistance(from, to) {
  return Math.abs(from.gridX - to.gridX) + Math.abs(from.gridY - to.gridY);
}

export function snapToGrid(x, y) {
  return { gridX: Math.round(x / GRID.cellSize), gridY: Math.round(y / GRID.cellSize) };
}

export function getTransportDuration(level, from, to) {
  return level.transportMode === "distance"
    ? 0.5 * Math.max(1, manhattanDistance(from, to))
    : 0.5;
}
```

Define all five `LEVELS` entries with the exact durations, targets, device limits and transport mode from the approved specification. Set level 4 obstacles to `(7,3)`、`(12,7)`、`(17,3)`; level 5 uses those three plus `(7,10)` and `(17,10)`. Store machine duration and source interval on each level, not in UI text. Add `nextUnlockedLevel(unlockedLevel, completedLevelId)` returning `Math.max(unlockedLevel, Math.min(5, completedLevelId + 1))`.

- [ ] **Step 4: Run focused tests and the existing level-one tests**

Run: `pnpm test -- --test-name-pattern="grid|transport|correct line|first bolt"` from `game`.

Expected: PASS, including the existing 36.5-second level-one timing regression.

- [ ] **Step 5: Commit the data-layer foundation**

```bash
git add game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/app/game/factory-grid.mjs game/app/game/factory-grid.d.mts game/tests/factory-grid.test.mjs game/tests/factory-model.test.mjs
git commit -m "feat: add chapter level configuration"
```

## Task 2: Generalize the production simulation for drilling and multiple machines

**Files:**
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/app/game/factory-model.d.mts`
- Modify: `game/tests/factory-model.test.mjs`

**Interfaces:**
- Consumes `LEVELS` and `getTransportDuration` from Task 1.
- Produces `createProductionState(design, level)`, `startProduction(state, { edited, design, level })`, `advanceProduction(state, design, level, deltaSeconds)`.
- `ProductionState.sources` is `Record<string, SourceState>`; `ProductionState.machines` includes cutters, lathes and drills.

- [ ] **Step 1: Write failing level-two quality and timing tests**

```js
test("level two rejects an undrilled bolt at the exit", () => {
  const state = simulate(levelTwoWithoutDrill(), LEVELS[2], 45);
  assert.equal(state.completed, 0);
  assert.match(state.warning, /缺少孔位/);
});

test("level two completes ten drilled bolts before its limit", () => {
  const state = simulate(levelTwoCorrectDesign(), LEVELS[2], 39.1);
  assert.equal(state.mode, "success");
  assert.equal(state.completed, 10);
});
```

- [ ] **Step 2: Run the level-two tests and verify failure**

Run: `pnpm test -- --test-name-pattern="level two"` from `game`.

Expected: FAIL because `drill` and `undrilledBolt` are not modelled.

- [ ] **Step 3: Make all simulation state device-indexed and level-aware**

```js
const PROCESSING_TYPES = new Set(["cutter", "lathe", "drill"]);

export function createProductionState(design, level) {
  return {
    levelId: level.id,
    mode: "design",
    elapsed: 0,
    completed: 0,
    sources: Object.fromEntries(sourceDevices.map((device) => [device.id, emptySourceState()])),
    machines: Object.fromEntries(processingDevices.map((device) => [device.id, emptyMachineState()])),
    lines: createLines(design),
    warning: null,
  };
}
```

Add `drill` to `DEVICE_TYPES`, `undrilledBolt` to `MATERIALS`, and a level-specific lathe output: level 1 produces `bolt`; levels 2–5 produce `undrilledBolt`. In `deliverToTarget`, remove and warn on an undrilled bolt delivered to an exit; do not set a permanent blocked line state for this quality rejection. Use the current level’s interval, machine duration, target and transport duration in every tick.

- [ ] **Step 4: Run level-one and level-two model tests**

Run: `pnpm test -- --test-name-pattern="correct line|first bolt|level two|pause|sixty"` from `game`.

Expected: PASS. Level 1 retains its V0.1 timing; level 2 warns on missing drilling and succeeds through drilling.

- [ ] **Step 5: Commit the generalized simulator**

```bash
git add game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/tests/factory-model.test.mjs
git commit -m "feat: simulate drilled bolt production"
```

## Task 3: Add deterministic fan-out, fan-in and level-three throughput

**Files:**
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/app/game/factory-model.d.mts`
- Modify: `game/tests/factory-model.test.mjs`

**Interfaces:**
- Consumes multiple source and machine states from Task 2.
- Produces `Connection.branchIndex`, `ProductionState.routingCursor[deviceId]`, and level-aware port validation.
- Later UI reads `branchIndex` to label outbound connections A, B and C.

- [ ] **Step 1: Write failing fan-out and bottleneck tests**

```js
test("level three keeps one-output and one-input restrictions only for earlier levels", () => {
  const design = connectDevices(levelThreeDesign, "source", "cutter-a", LEVELS[3]);
  assert.notEqual(connectDevices(design, "source", "cutter-b", LEVELS[3]), design);
});

test("level three dispatches A then B and does not skip a blocked turn", () => {
  const state = simulate(routingProbeDesign(), LEVELS[3], 5);
  assert.deepEqual(sentLineIds(state), ["source->cutter-a", "source->cutter-b"]);
  assert.equal(nextDispatchWaitsForBlockedA(state), true);
});

test("a single level-three branch cannot meet twelve units, while two branches can", () => {
  assert.notEqual(simulate(singleBranchDesign(), LEVELS[3], 27).mode, "success");
  assert.equal(simulate(twoBranchDesign(), LEVELS[3], 27).completed >= 12, true);
});
```

- [ ] **Step 2: Run fan-out tests and verify failure**

Run: `pnpm test -- --test-name-pattern="level three|dispatch|branch"` from `game`.

Expected: FAIL because the current model forbids all reused output and input ports.

- [ ] **Step 3: Implement connection multiplicity and strict routing cursors**

```js
function outgoing(design, deviceId) {
  return design.connections
    .filter((connection) => connection.from === deviceId)
    .sort((a, b) => a.branchIndex - b.branchIndex);
}

function selectOutgoingLine(state, design, deviceId) {
  const lines = outgoing(design, deviceId);
  const index = state.routingCursor[deviceId] ?? 0;
  const chosen = lines[index % lines.length];
  if (!state.lines[chosen.id] || state.lines[chosen.id].item) return null;
  state.routingCursor[deviceId] = (index + 1) % lines.length;
  return chosen;
}
```

For levels 1 and 2, keep one output and one input connection. For levels 3 and 5, permit multiple outgoing and incoming connections, assign each new outgoing connection the next `branchIndex`, and route each produced item only to the currently selected branch. Advance the cursor only after the item is successfully placed on that line.

- [ ] **Step 4: Run all model tests**

Run: `pnpm test -- --test-name-pattern="level three|dispatch|branch|level two|correct line|pause"` from `game`.

Expected: PASS, with no regression in earlier-level port restrictions.

- [ ] **Step 5: Commit routing support**

```bash
git add game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/tests/factory-model.test.mjs
git commit -m "feat: add deterministic parallel routing"
```

## Task 4: Enforce limited workstations and distance-based transport

**Files:**
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/app/game/factory-model.d.mts`
- Modify: `game/app/game/factory-grid.mjs`
- Modify: `game/app/game/factory-grid.d.mts`
- Modify: `game/tests/factory-grid.test.mjs`
- Modify: `game/tests/factory-model.test.mjs`

**Interfaces:**
- Consumes grid helpers from Task 1 and level-aware simulation from Tasks 2–3.
- Produces `canPlaceDevice(design, level, cell, deviceId?)` and line items carrying their launch-time `transportDuration`.

- [ ] **Step 1: Write failing obstacle and distance tests**

```js
test("level four rejects placement that overlaps an obstacle but allows a connection across it", () => {
  assert.equal(canPlaceDevice(emptyDesign, LEVELS[4], { gridX: 7, gridY: 3 }), false);
  assert.notEqual(connectDevices(designAcrossObstacle, "cutter", "lathe", LEVELS[4]), designAcrossObstacle);
});

test("a longer level-four line takes longer to deliver the same material", () => {
  assert.equal(deliveryTime(compactLevelFourDesign()), 0.5);
  assert.equal(deliveryTime(longLevelFourDesign()), 3);
});
```

- [ ] **Step 2: Run obstacle and distance tests and verify failure**

Run: `pnpm test -- --test-name-pattern="obstacle|longer level-four|distance"` from `game`.

Expected: FAIL because placement validation and per-line transport duration are absent.

- [ ] **Step 3: Capture grid cells on devices and transport duration on launched items**

```js
export function canPlaceDevice(design, level, cell, ignoredDeviceId = null) {
  if (isObstaclePlacement(level, cell)) return false;
  return !Object.values(design.devices).some((device) =>
    device.id !== ignoredDeviceId && device.gridX === cell.gridX && device.gridY === cell.gridY,
  );
}

line.item = {
  kind,
  progress: 0,
  status: "moving",
  transportDuration: getTransportDuration(level, fromDevice, toDevice),
};
```

Advance each item using its own launch-time transport duration. Preserve fixed 0.5-second transport in levels 1–3. Add a full level-five standard-layout simulation test proving 14 items complete in 32 seconds.

- [ ] **Step 4: Run spatial and chapter timing tests**

Run: `pnpm test -- --test-name-pattern="obstacle|distance|level four|level five|level three"` from `game`.

Expected: PASS; obstacles affect only placement and long lines delay the item that uses them.

- [ ] **Step 5: Commit the spatial rules**

```bash
git add game/app/game/factory-model.mjs game/app/game/factory-model.d.mts game/app/game/factory-grid.mjs game/app/game/factory-grid.d.mts game/tests/factory-grid.test.mjs game/tests/factory-model.test.mjs
git commit -m "feat: add factory floor constraints"
```

## Task 5: Build the level selection and level-aware control shell

**Files:**
- Create: `game/app/game/LevelSelectModal.tsx`
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Modify: `game/app/game/MachineCard.tsx`
- Modify: `game/app/game/game.css`
- Modify: `game/tests/game-source-contract.test.mjs`
- Modify: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes `LEVELS`, `getLevelConfig`, `getDeviceLimit`, `canPlaceDevice`, and level-aware model calls.
- Produces `LevelSelectModal({ unlockedLevel, activeLevel, onSelect, onClose })` and passes `level` to all model operations.

- [ ] **Step 1: Write failing UI-contract tests for the chapter shell**

```js
test("the game source exposes chapter selection, drilling and level-aware targets", async () => {
  const source = await readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8");
  assert.match(source, /LevelSelectModal/);
  assert.match(source, /钻孔机/);
  assert.match(source, /unlockedLevel/);
  assert.match(source, /LEVELS/);
});
```

- [ ] **Step 2: Run UI-contract tests and verify failure**

Run: `pnpm test -- --test-name-pattern="chapter selection|drilling|level-aware"` from `game`.

Expected: FAIL because the current UI is fixed to V0.1 level one.

- [ ] **Step 3: Implement selection, unlock and dynamic palette behaviour**

```tsx
const [activeLevelId, setActiveLevelId] = useState<LevelId>(1);
const [unlockedLevel, setUnlockedLevel] = useState<LevelId>(1);
const level = LEVELS[activeLevelId];

const selectLevel = (levelId: LevelId) => {
  const nextDesign = createEmptyDesign();
  setActiveLevelId(levelId);
  setDesign(nextDesign);
  setState(createProductionState(nextDesign, LEVELS[levelId]));
};
```

Render palette entries from `level.deviceLimits`, permit the configured number of duplicate machine types, and use level-provided label, route hint, target and duration everywhere that currently hard-codes `60`, `10`, four devices or V0.1 text. Add the drill icon and state text to `MachineCard`. On success, set `unlockedLevel` to `max(unlockedLevel, min(5, activeLevelId + 1))`; hide the next-level action after level 5.

- [ ] **Step 4: Run UI-contract and server-render tests**

Run: `pnpm test -- --test-name-pattern="game exposes|chapter selection|server-renders"` from `game`.

Expected: PASS and rendered HTML contains the first-level shell plus the first-level onboarding text.

- [ ] **Step 5: Commit the chapter control shell**

```bash
git add game/app/game/LevelSelectModal.tsx game/app/game/MiniFactoryGame.tsx game/app/game/MachineCard.tsx game/app/game/game.css game/tests/game-source-contract.test.mjs game/tests/rendered-html.test.mjs
git commit -m "feat: add chapter level selection"
```

## Task 6: Render obstacles, branch labels, transport times and contextual feedback

**Files:**
- Modify: `game/app/game/FactoryFloor.tsx`
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Modify: `game/app/game/MachineCard.tsx`
- Modify: `game/app/game/game.css`
- Modify: `game/tests/game-source-contract.test.mjs`

**Interfaces:**
- Consumes `level.obstacles`, device grid coordinates, `connection.branchIndex`, and `line.item.transportDuration`.
- Produces a floor that renders obstacle workstations, A/B/C labels and persistent per-line transport durations.

- [ ] **Step 1: Write failing visual-source contract tests**

```js
test("the floor source renders obstacles, branch labels and transport duration", async () => {
  const floor = await readFile(new URL("../app/game/FactoryFloor.tsx", import.meta.url), "utf8");
  assert.match(floor, /obstacles/);
  assert.match(floor, /branchIndex/);
  assert.match(floor, /transportDuration/);
});
```

- [ ] **Step 2: Run the focused UI test and verify failure**

Run: `pnpm test -- --test-name-pattern="obstacles, branch labels"` from `game`.

Expected: FAIL because the floor only renders plain links.

- [ ] **Step 3: Render all new spatial and routing affordances**

```tsx
{level.obstacles.map((cell) => (
  <div key={`${cell.gridX}-${cell.gridY}`} className="floor-obstacle" style={gridStyle(cell)} />
))}
{level.transportMode === "distance" && (
  <text className="connection-duration" x={labelX} y={labelY}>{line.transportDuration.toFixed(1)}s</text>
)}
{connection.branchIndex != null && <text className="connection-branch">{String.fromCharCode(65 + connection.branchIndex)}</text>}
```

Update the feedback bar so it calls out quality rejection, blocked target device and routing waits. Add styles with sufficient contrast for obstacles, A/B/C badges and duration labels; do not rely on colour alone because the labels carry the meaning.

- [ ] **Step 4: Run UI-contract tests, lint and a production build**

Run: `pnpm test -- --test-name-pattern="floor source|interaction layer|chapter selection" && pnpm lint && pnpm build` from `game`.

Expected: PASS, with no TypeScript, ESLint or production-build error.

- [ ] **Step 5: Commit visible chapter mechanics**

```bash
git add game/app/game/FactoryFloor.tsx game/app/game/MiniFactoryGame.tsx game/app/game/MachineCard.tsx game/app/game/game.css game/tests/game-source-contract.test.mjs
git commit -m "feat: visualize factory routing and constraints"
```

## Task 7: Run the full verification suite and refresh player-facing copy

**Files:**
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Modify: `game/tests/factory-model.test.mjs`
- Modify: `game/tests/game-source-contract.test.mjs`
- Modify: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes the complete model and UI from Tasks 1–6.
- Produces a verified chapter build with deterministic acceptance coverage for all five levels.

- [ ] **Step 1: Add final acceptance tests for unlock, settlement and reset rules**

```js
test("success unlocks exactly the next level and level five has no next-level action", () => {
  assert.equal(nextUnlockedLevel(1), 2);
  assert.equal(nextUnlockedLevel(5), 5);
});

test("editing while paused resets the selected level duration and completed count", () => {
  const reset = startProduction(pausedState, { edited: true, design, level: LEVELS[4] });
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.completed, 0);
  assert.equal(LEVELS[4].duration, 45);
});
```

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test` from `game`.

Expected: PASS for model, grid, source-contract and rendered-HTML tests.

- [ ] **Step 3: Correct any player-visible copy still tied to V0.1**

Review all strings in `MiniFactoryGame.tsx`, `MachineCard.tsx` and onboarding content. Keep the level-one onboarding specific to its three-step route; show contextual route and target copy for later levels. Confirm the fifth settlement omits a next-level button.

- [ ] **Step 4: Run lint, production build and manual smoke checklist**

Run: `pnpm lint && pnpm build` from `game`.

Manual smoke checklist: open level 1 and finish its original route; select level 2 and observe the drilling quality warning; select level 3 and create two labelled branches; select level 4 and confirm an obstacle rejects placement; finish level 5 with two compact branches.

Expected: lint and build PASS; all five interactions match the approved chapter specification.

- [ ] **Step 5: Commit final verification fixes**

```bash
git add game/app/game/MiniFactoryGame.tsx game/tests/factory-model.test.mjs game/tests/game-source-contract.test.mjs game/tests/rendered-html.test.mjs
git commit -m "test: verify factory chapter progression"
```

## Plan self-review

- **Spec coverage:** Tasks 1–4 cover the five configured levels, exact timings, drill quality gate, deterministic branch routing, obstacles and distance transport. Tasks 5–6 cover selection, unlock, editing, visual feedback and settlement. Task 7 covers final acceptance and player-visible copy.
- **Placeholder scan:** The plan contains no unfinished requirement markers or deferred implementation directions; every task names files, interfaces, tests, commands and commit scope.
- **Type consistency:** `LevelConfig`, level-aware model calls, grid cells, `branchIndex`, `transportDuration` and `unlockedLevel` are defined before later tasks consume them.
