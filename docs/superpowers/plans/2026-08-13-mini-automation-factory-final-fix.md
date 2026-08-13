# Mini Automation Factory Final Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the final review findings for source limits, failure diagnostics, paused-edit action copy, and directly adjacent UI/lint issues.

**Architecture:** Keep level data and deterministic simulation in `factory-model.mjs`. Put reusable presentation decisions in small pure policy modules so Node behavior tests can exercise them without a browser DOM, while source-contract tests verify that the React UI consumes those policies.

**Tech Stack:** React 19, TypeScript, ES modules, Node `node:test`, ESLint, Vinext.

## Global Constraints

- Level 3 and level 5 expose exactly one source.
- A standard level-five compact layout fans one source out to two complete branches and completes 14 bolts within 32 seconds.
- Failure settlement shows the most direct runtime diagnostic when present and otherwise uses the level route hint.
- A paused, edited attempt labels the primary action exactly `重新开始生产`.
- Level 5 is named exactly `工坊验收`.
- Branch labels appear only on connections from a device with more than one outgoing connection.
- The final lint run has no `_level` warning.

---

### Task 1: Correct source limits and level-five acceptance topology

**Files:**
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/tests/factory-model.test.mjs`

**Interfaces:**
- Consumes: `LEVELS`, `getDeviceLimit`, `connectDevices`, `simulateAtLevel` test helper.
- Produces: L3/L5 `deviceLimits.source === 1`; single-source two-branch L5 fixture.

- [ ] **Step 1: Write failing source-limit and single-source acceptance tests**

```js
assert.equal(getDeviceLimit(LEVELS[3], "source"), 1);
assert.equal(getDeviceLimit(LEVELS[5], "source"), 1);
assert.equal(Object.values(design.devices).filter(({ type }) => type === "source").length, 1);
assert.equal(outgoing(design, "source").length, 2);
assert.equal(simulateAtLevel(design, LEVELS[5], 32).completed, 14);
```

- [ ] **Step 2: Run the focused tests and verify the expected failures**

Run: `node --test --test-name-pattern="source limits|single-source" tests/factory-model.test.mjs`

Expected: source limit assertions report `2 !== 1`, and the old two-source fixture violates the topology assertion.

- [ ] **Step 3: Apply the minimal configuration and fixture changes**

Set L3/L5 `source` limits to `1`, rename L5 to `工坊验收`, and build both compact branches from the same `source` device.

- [ ] **Step 4: Run the focused model tests and verify green**

Run: `node --test --test-name-pattern="source limits|single-source|level three" tests/factory-model.test.mjs`

Expected: all selected tests pass; the L5 simulation reaches 14 by 32 seconds.

### Task 2: Route direct diagnostics into failure settlement

**Files:**
- Modify: `game/app/game/feedback-policy.mjs`
- Modify: `game/app/game/feedback-policy.d.mts`
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Modify: `game/tests/feedback-policy.test.mjs`
- Modify: `game/tests/game-source-contract.test.mjs`

**Interfaces:**
- Produces: `getFailureDiagnostic(warning, contextualFeedback, routeHint): string`.

- [ ] **Step 1: Write a failing behavior test for diagnostic precedence and a UI wiring contract**

```js
assert.equal(getFailureDiagnostic("缺少孔位", "质量拒收：请接入钻孔机。", "完整路线"), "质量拒收：请接入钻孔机。");
assert.equal(getFailureDiagnostic(null, null, "完整路线"), "完整路线");
```

The source contract requires the failure settlement branch to call `getFailureDiagnostic`.

- [ ] **Step 2: Run the focused tests and verify the missing export/wiring failures**

Run: `node --test tests/feedback-policy.test.mjs tests/game-source-contract.test.mjs`

- [ ] **Step 3: Implement and consume the minimal policy**

```js
export function getFailureDiagnostic(warning, contextualFeedback, routeHint) {
  return contextualFeedback ?? warning ?? routeHint;
}
```

Use it only in the failure settlement copy; keep success settlement unchanged.

- [ ] **Step 4: Run the focused tests and verify green**

Run: `node --test tests/feedback-policy.test.mjs tests/game-source-contract.test.mjs`

### Task 3: Distinguish paused-edit restart in the real control wiring

**Files:**
- Create: `game/app/game/production-controls.mjs`
- Create: `game/app/game/production-controls.d.mts`
- Modify: `game/app/game/MiniFactoryGame.tsx`
- Create: `game/tests/production-controls.test.mjs`
- Modify: `game/tests/game-source-contract.test.mjs`

**Interfaces:**
- Produces: `markDesignEdited(mode, editedWhilePaused, previousDesign, nextDesign)` and `getProductionActionLabel(mode, editedWhilePaused)`.

- [ ] **Step 1: Write a failing event-sequence behavior test**

```js
const nextDesign = moveDevice(design, "cutter", 108, 36);
const edited = markDesignEdited("paused", false, design, nextDesign);
assert.equal(getProductionActionLabel("paused", edited), "重新开始生产");
assert.equal(getProductionActionLabel("paused", false), "继续生产");
assert.equal(getProductionActionLabel("design", false), "开始生产");
```

The source contract also verifies `mutateDesign` passes the previous and next designs into `markDesignEdited` and the rendered button calls `getProductionActionLabel`.

- [ ] **Step 2: Run the focused tests and verify the missing module/wiring failures**

Run: `node --test tests/production-controls.test.mjs tests/game-source-contract.test.mjs`

- [ ] **Step 3: Implement the two pure policies and wire successful design mutations to them**

```js
export function markDesignEdited(mode, editedWhilePaused, previousDesign, nextDesign) {
  return editedWhilePaused || (mode === "paused" && nextDesign !== previousDesign);
}

export function getProductionActionLabel(mode, editedWhilePaused) {
  if (mode !== "paused") return "开始生产";
  return editedWhilePaused ? "重新开始生产" : "继续生产";
}
```

- [ ] **Step 4: Run the focused tests and verify green**

Run: `node --test tests/production-controls.test.mjs tests/game-source-contract.test.mjs`

### Task 4: Remove adjacent lint and branch-label defects, then verify

**Files:**
- Modify: `game/app/game/factory-model.mjs`
- Modify: `game/app/game/FactoryFloor.tsx`
- Modify: `game/tests/game-source-contract.test.mjs`
- Create: `.superpowers/sdd/2026-08-13-mini-automation-factory-chapter-one/final-fix-report.md`

**Interfaces:**
- Consumes: `outgoing(design, connection.from)`.
- Produces: branch labels only when the source device has multiple outbound connections.

- [ ] **Step 1: Add a failing branch-label wiring assertion**

Require `FactoryFloor` to derive label visibility from `outgoing(design, connection.from).length > 1`.

- [ ] **Step 2: Run the UI contract and verify failure**

Run: `node --test tests/game-source-contract.test.mjs`

- [ ] **Step 3: Make the minimal adjacent fixes**

Remove the unused level parameter from `createProductionState`, update its declaration/callers, and derive branch visibility per source device rather than per level.

- [ ] **Step 4: Run fresh full verification**

Run: `pnpm test`; `node node_modules/typescript/bin/tsc --noEmit`; `pnpm lint`; `pnpm build`.

- [ ] **Step 5: Write the final-fix report and commit all scoped changes**

The report records RED/GREEN evidence, exact verification results, changed files, SHA, and remaining environment concerns. Commit message: `fix: address final factory review`.

## Plan self-review

- **Spec coverage:** Every final review item maps to one task; the L5 fixture uses one source, failure copy has runtime precedence, paused edits have a distinct action label, and all listed minor issues are covered.
- **Placeholder scan:** No deferred implementation placeholders remain.
- **Type consistency:** The new `.d.mts` declarations match the pure policy function signatures consumed by TypeScript.
