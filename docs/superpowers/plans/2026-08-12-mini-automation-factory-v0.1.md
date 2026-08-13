# Mini Automation Factory V0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish the complete desktop-browser teaching level for 《迷你自动化工厂》, including drag-and-drop layout, port connections, deterministic production simulation, feedback, pause/edit/restart behavior, and success/failure settlement.

**Architecture:** Keep the deployable Sites project in `game/`, separate from repository documentation. Put all production rules in a deterministic pure JavaScript state machine so timing, blocking, errors, and reset semantics are testable without a browser; the React client renders that state and translates drag/drop and control gestures into model operations.

**Tech Stack:** Vinext, React 19, TypeScript, CSS, Node.js built-in test runner, Cloudflare-compatible Sites output.

## Global Constraints

- Desktop browser, mouse-first, single route, Chinese UI.
- Level goal: produce 10 valid bolts within 60.0 seconds.
- Cadence: source 3.0 s, cutting 2.0 s, turning 3.0 s, each connection 0.5 s, exit instantaneous.
- Each processing machine has one processing slot and one waiting slot; each line holds one item.
- Production locks layout; pause freezes simulation; editing while paused makes the next start a clean attempt.
- V0.1 contains only the bolt tutorial level and no persistence, accounts, mobile layout, later levels, costs, failures, AGVs, or upgrades.

---

### Task 1: Sites shell and product metadata

**Files:**
- Create via the bundled Sites initializer: `game/`
- Modify: `game/package.json`
- Modify: `game/app/layout.tsx`
- Modify: `game/app/page.tsx`
- Modify: `game/app/globals.css`
- Delete: `game/app/_sites-preview/SkeletonPreview.tsx`
- Delete: `game/app/_sites-preview/preview.css`
- Test: `game/tests/rendered-html.test.mjs`

**Interfaces:**
- Produces: a single `/` route with a `MiniFactoryGame` mount point and site-specific metadata.

- [ ] **Step 1: Initialize the Sites project once**

Run the bundled initializer with `game/` as the target, retain the installed lockfile, and start the development server.

- [ ] **Step 2: Replace the starter test with a failing product-shell test**

```js
test("server-renders the mini factory game shell", async () => {
  const html = await renderHome();
  assert.match(html, /<title>迷你自动化工厂/);
  assert.match(html, /第 1 关：螺栓生产/);
  assert.match(html, /60 秒内生产 10 个合格螺栓/);
  assert.doesNotMatch(html, /codex-preview|Building your site|react-loading-skeleton/);
});
```

- [ ] **Step 3: Run the test and verify RED**

Run: `npm test`
Expected: FAIL because the starter title and skeleton are still rendered.

- [ ] **Step 4: Implement the site shell and metadata**

Render the finished Chinese product title, level objective, and `<MiniFactoryGame />`; remove starter preview files, preview metadata, and the unused skeleton dependency. Set title to `迷你自动化工厂｜螺栓生产` and description to `拖拽设备、连接端口，在 60 秒内完成 10 个螺栓。`.

- [ ] **Step 5: Run the shell test and verify GREEN**

Run: `npm test`
Expected: PASS with no starter content.

- [ ] **Step 6: Commit**

```bash
git add game
git commit -m "feat: scaffold mini automation factory site"
```

### Task 2: Deterministic production model

**Files:**
- Create: `game/app/game/factory-model.mjs`
- Create: `game/app/game/factory-model.d.ts`
- Create: `game/tests/factory-model.test.mjs`
- Modify: `game/package.json`

**Interfaces:**
- Produces: `DEVICE_TYPES`, `LEVEL_CONFIG`, `createEmptyDesign()`, `addDevice()`, `moveDevice()`, `connectDevices()`, `removeConnection()`, `createProductionState()`, `startProduction()`, `pauseProduction()`, and `advanceProduction()`.
- `advanceProduction(state, design, deltaSeconds)` returns a new immutable production state with `mode`, `elapsed`, `completed`, `source`, `machines`, `lines`, and `warning`.

- [ ] **Step 1: Write failing model tests**

```js
test("the correct line completes ten bolts before sixty seconds", () => {
  const design = createCorrectDesign();
  let state = startProduction(createProductionState(design));
  state = advanceProduction(state, design, 36.6);
  assert.equal(state.completed, 10);
  assert.equal(state.mode, "success");
});

test("a rod sent directly to the lathe raises the specified warning", () => {
  const state = simulate(createRodToLatheDesign(), 4);
  assert.match(state.warning ?? "", /车削机不能加工长钢棒，需要先完成切割工序/);
});

test("pause freezes time and starting after an edit resets the attempt", () => {
  const paused = pauseProduction(simulate(createCorrectDesign(), 8));
  assert.deepEqual(advanceProduction(paused, createCorrectDesign(), 5), paused);
  const reset = startProduction(paused, { edited: true });
  assert.equal(reset.elapsed, 0);
  assert.equal(reset.completed, 0);
});
```

- [ ] **Step 2: Run model tests and verify RED**

Run: `node --test tests/factory-model.test.mjs`
Expected: FAIL because `factory-model.mjs` does not exist.

- [ ] **Step 3: Implement the minimal immutable state machine**

Use 0.01-second internal slices. Process completed line deliveries, finished machine output, machine waiting-slot promotion, source generation, and 60-second settlement deterministically. Reject connections that reuse an input/output, and retain invalid material at the destination with a warning.

- [ ] **Step 4: Run model tests and verify GREEN**

Run: `node --test tests/factory-model.test.mjs`
Expected: PASS for timing, capacities, invalid routing, pausing, resetting, and failure at 60.0 seconds.

- [ ] **Step 5: Commit**

```bash
git add game/app/game game/tests game/package.json
git commit -m "feat: add deterministic factory simulation"
```

### Task 3: Interactive factory floor

**Files:**
- Create: `game/app/game/MiniFactoryGame.tsx`
- Create: `game/app/game/MachineCard.tsx`
- Create: `game/app/game/FactoryFloor.tsx`
- Create: `game/app/game/game.css`
- Create: `game/tests/game-source-contract.test.mjs`
- Modify: `game/app/page.tsx`

**Interfaces:**
- Consumes: all Task 2 model operations and production state.
- Produces: accessible equipment palette, draggable machine cards and ports, SVG routes/materials, controls, warnings, and settlement dialog.

- [ ] **Step 1: Write a failing source contract test**

```js
test("the game exposes all four machines and production controls", async () => {
  const source = await readFile(new URL("../app/game/MiniFactoryGame.tsx", import.meta.url), "utf8");
  for (const label of ["钢棒源", "切割机", "车削机", "成品出口", "开始生产", "暂停生产"]) {
    assert.match(source, new RegExp(label));
  }
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/game-source-contract.test.mjs`
Expected: FAIL because the game component does not exist.

- [ ] **Step 3: Implement the complete interaction layer**

Use native drag/drop for palette-to-floor placement, machine movement, and output-port-to-input-port connection. Draw connections and material progress in an SVG overlay. While running, call `advanceProduction` from `requestAnimationFrame`; while paused, enable editing and mark any edit so the next start resets production.

- [ ] **Step 4: Implement visual and accessible feedback**

Use a warm industrial control-room palette, strong machine silhouettes made with CSS, visible focus states, text labels in addition to color, reduced-motion handling, the exact warning copy, and success/failure dialogs with the specified metrics and disabled next-level button.

- [ ] **Step 5: Run tests and build**

Run: `npm test`
Expected: all model, source contract, and rendered HTML tests PASS; production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add game
git commit -m "feat: build interactive bolt production level"
```

### Task 4: Final acceptance and private deployment

**Files:**
- Modify only files required to fix verification failures.

**Interfaces:**
- Consumes: the complete level.
- Produces: a clean verified build and a private Sites URL.

- [ ] **Step 1: Run the complete verification suite**

Run: `npm test && npm run lint && npm run build`
Expected: all commands exit 0 with no test failures or lint errors.

- [ ] **Step 2: Check spec coverage**

Verify all nine acceptance criteria in `docs/superpowers/specs/2026-08-12-mini-automation-factory-design.md` against model tests and rendered controls. Confirm the repository contains no placeholder markers, starter preview marker, or enabled next-level flow.

- [ ] **Step 3: Deploy privately with Sites**

Create or update the private site, deploy the verified worker bundle, and wait until deployment status is ready.

- [ ] **Step 4: Commit any final verification fixes**

```bash
git add game docs/superpowers/plans/2026-08-12-mini-automation-factory-v0.1.md
git commit -m "chore: verify mini automation factory V0.1"
```
