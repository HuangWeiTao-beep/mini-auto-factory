import assert from "node:assert/strict";
import test from "node:test";

import {
  SAVE_VERSION,
  loadGameSave,
  saveGameSave,
  serializeGameSave,
} from "../app/game/game-save.mjs";
import {
  LEVELS,
  createOrderScenario,
  createProductionState,
} from "../app/game/factory-model.mjs";
import {
  applyProductionState,
  clearGameSession,
  enqueueSessionOrder,
  generateChapterTwoSeed,
  moveSessionQueuedOrder,
  recordBestResult,
  resolveClearProgressDecision,
  restoreGameSession,
  resetGameSession,
  selectGameLevel,
  startGameSession,
  shouldShowOnboardingAfterRestore,
  toPersistedGameSession,
  updateGameDesign,
  saveGameSession,
} from "../app/game/game-session.mjs";

function memoryStorage() {
  let value = null;
  return {
    getItem() { return value; },
    setItem(_key, next) { value = next; },
    removeItem() { value = null; },
  };
}

const draft = {
  devices: { source: { id: "source", type: "source", x: 36, y: 36, gridX: 1, gridY: 1 } },
  connections: [],
};

test("restoring a selected level recovers its unlocked progress, best result, and draft", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 3,
    bestResults: { 2: { elapsed: 33.2, completed: 10 } },
    drafts: { 2: draft },
    chapterTwoSeeds: {},
  });

  const session = restoreGameSession(storage, 2);

  assert.equal(session.unlockedLevel, 3);
  assert.deepEqual(session.bestResults, { 2: { elapsed: 33.2, completed: 10 } });
  assert.deepEqual(session.design, draft);
  assert.deepEqual(session.state, createProductionState(draft));
});

test("saving a running production state preserves the last non-running layout draft", () => {
  const storage = memoryStorage();
  const previousDraft = { devices: {}, connections: [] };
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    bestResults: {},
    drafts: { 1: previousDraft },
    chapterTwoSeeds: {},
  });

  const runningState = { ...createProductionState(draft), mode: "running" };
  saveGameSession(storage, {
    activeLevelId: 1,
    unlockedLevel: 2,
    bestResults: { 1: { elapsed: 40, completed: 10 } },
    design: draft,
    state: runningState,
  });

  assert.deepEqual(loadGameSave(storage), {
    version: SAVE_VERSION,
    unlockedLevel: 2,
    activeLevelId: 1,
    bestResults: { 1: { elapsed: 40, completed: 10 } },
    drafts: { 1: previousDraft },
    chapterTwoSeeds: {},
  });
});

test("saving a paused layout makes that layout available after a refresh", () => {
  const storage = memoryStorage();
  const pausedState = { ...createProductionState(draft), mode: "paused" };

  saveGameSession(storage, {
    activeLevelId: 2,
    unlockedLevel: 2,
    bestResults: {},
    design: draft,
    state: pausedState,
  });

  const refreshed = restoreGameSession(storage);
  assert.equal(refreshed.activeLevelId, 2);
  assert.deepEqual(refreshed.design, draft);
});

test("a running save keeps the latest design that was saved before production started", () => {
  const storage = memoryStorage();
  const originalDraft = { devices: {}, connections: [] };
  const revisedDraft = {
    devices: {
      source: { ...draft.devices.source, x: 72, gridX: 2 },
    },
    connections: [],
  };
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: { 1: originalDraft },
    chapterTwoSeeds: {},
  });
  const revised = updateGameDesign(restoreGameSession(storage), revisedDraft);

  saveGameSession(storage, revised);
  const running = startGameSession(revised, LEVELS[1]);
  saveGameSession(storage, running);

  assert.deepEqual(restoreGameSession(storage).design, revisedDraft);
});

test("restoring the second level keeps its saved draft in design mode without level-one onboarding", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 2,
    activeLevelId: 2,
    bestResults: {},
    drafts: { 2: draft },
    chapterTwoSeeds: {},
  });

  const refreshed = restoreGameSession(storage);

  assert.equal(refreshed.activeLevelId, 2);
  assert.deepEqual(refreshed.design, draft);
  assert.equal(refreshed.state.mode, "design");
  assert.equal(shouldShowOnboardingAfterRestore(refreshed), false);
});

test("clearing a session removes persisted progress and returns a new level-one session", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 3,
    activeLevelId: 3,
    bestResults: { 2: { elapsed: 33.2, completed: 10 } },
    drafts: { 3: draft },
    chapterTwoSeeds: {},
  });

  const session = clearGameSession(storage);

  assert.deepEqual(loadGameSave(storage), {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: {},
    chapterTwoSeeds: {},
  });
  assert.equal(session.activeLevelId, 1);
  assert.equal(session.unlockedLevel, 1);
  assert.deepEqual(session.bestResults, {});
  assert.deepEqual(session.design, { devices: {}, connections: [] });
  assert.deepEqual(session.state, createProductionState(session.design));
});

test("cancelling progress clear preserves the current session and never invokes its storage boundary", () => {
  const storage = memoryStorage();
  const persisted = {
    version: SAVE_VERSION,
    unlockedLevel: 3,
    activeLevelId: 3,
    bestResults: { 2: { elapsed: 33.2, completed: 10 } },
    drafts: { 3: draft },
    chapterTwoSeeds: {},
  };
  saveGameSave(storage, persisted);
  const currentSession = restoreGameSession(storage);
  const rawBeforeCancel = storage.getItem();
  let clearCalls = 0;

  const nextSession = resolveClearProgressDecision(false, currentSession, () => {
    clearCalls += 1;
    return clearGameSession(storage);
  });

  assert.strictEqual(nextSession, currentSession);
  assert.equal(clearCalls, 0);
  assert.equal(storage.getItem(), rawBeforeCancel);
  assert.deepEqual(loadGameSave(storage), persisted);
  assert.deepEqual(currentSession, restoreGameSession(storage));
});

test("session recovery remains safe without a storage implementation", () => {
  assert.doesNotThrow(() => restoreGameSession(undefined));
  assert.equal(restoreGameSession(undefined).activeLevelId, 1);
});

test("a faster successful run replaces the best result while a slower run does not", () => {
  const current = { 1: { elapsed: 42.5, completed: 10 } };

  assert.deepEqual(recordBestResult(current, 1, { elapsed: 38.2, completed: 10 }), {
    1: { elapsed: 38.2, completed: 10 },
  });
  assert.deepEqual(recordBestResult(current, 1, { elapsed: 49.7, completed: 10 }), current);
});

test("a newly completed level updates the session result and unlocks its successor", () => {
  const runningState = { ...createProductionState(draft), mode: "running" };
  const completedState = { ...runningState, mode: "success", elapsed: 41.5, completed: 10 };
  const session = {
    activeLevelId: 1,
    unlockedLevel: 1,
    bestResults: {},
    design: draft,
    state: runningState,
    editedWhilePaused: false,
    recordBroken: false,
  };

  const settled = applyProductionState(session, completedState, LEVELS[1]);

  assert.equal(settled.state, completedState);
  assert.equal(settled.unlockedLevel, 2);
  assert.deepEqual(settled.bestResults, { 1: { elapsed: 41.5, completed: 10 } });
  assert.equal(settled.recordBroken, true);
});

test("chapter boundaries unlock level six and never advance past level ten", () => {
  const complete = (levelId, unlockedLevel) => {
    const level = LEVELS[levelId];
    const scenario = levelId >= 6 ? createOrderScenario(levelId, 1600 + levelId) : null;
    const runningState = {
      ...createProductionState(draft, level, scenario),
      mode: "running",
    };
    return applyProductionState({
      activeLevelId: levelId,
      unlockedLevel,
      bestResults: {},
      design: draft,
      state: runningState,
      editedWhilePaused: false,
      recordBroken: false,
    }, {
      ...runningState,
      mode: "success",
      elapsed: 30,
      completed: level.target,
    }, level);
  };

  assert.equal(complete(5, 5).unlockedLevel, 6);
  assert.equal(complete(10, 10).unlockedLevel, 10);
});

test("chapter-two seed generation prefers crypto and always changes a retry seed", () => {
  const fixedCrypto = {
    getRandomValues(values) {
      values[0] = 1606;
      return values;
    },
  };

  assert.equal(generateChapterTwoSeed(undefined, fixedCrypto), 1606);
  assert.equal(generateChapterTwoSeed(1606, fixedCrypto), 1607);
  const fallbackA = generateChapterTwoSeed(undefined, {});
  const fallbackB = generateChapterTwoSeed(fallbackA, {});
  assert.notEqual(fallbackB, fallbackA);
});

test("restoring level six reuses its persisted seed and rebuilds a fresh deterministic scenario", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 6,
    activeLevelId: 6,
    bestResults: { 5: { elapsed: 35, completed: 14 } },
    drafts: { 6: draft },
    chapterTwoSeeds: { 6: 1606 },
  });
  const expectedScenario = createOrderScenario(6, 1606);
  const first = restoreGameSession(storage);
  const running = {
    ...first,
    state: {
      ...first.state,
      mode: "running",
      elapsed: 12,
      queue: [first.state.orders[0].id],
      orders: first.state.orders.map((order, index) =>
        index === 0 ? { ...order, status: "queued" } : order
      ),
    },
  };

  saveGameSession(storage, running);
  const refreshed = restoreGameSession(storage);

  assert.equal(refreshed.chapterTwoSeeds[6], 1606);
  assert.deepEqual(refreshed.scenario, expectedScenario);
  assert.deepEqual(refreshed.scenario.paletteTypes, expectedScenario.paletteTypes);
  assert.deepEqual(refreshed.design, draft);
  assert.deepEqual(refreshed.state, createProductionState(draft, LEVELS[6], expectedScenario));
  const persisted = loadGameSave(storage);
  assert.deepEqual(Object.keys(persisted).sort(), [
    "activeLevelId",
    "bestResults",
    "chapterTwoSeeds",
    "drafts",
    "unlockedLevel",
    "version",
  ]);
  assert.equal("orders" in persisted, false);
  assert.equal("queue" in persisted, false);
});

test("first chapter-two restore persists a seed while every retry replaces it", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 6,
    activeLevelId: 6,
    bestResults: {},
    drafts: { 6: draft },
    chapterTwoSeeds: {},
  });

  const restored = restoreGameSession(storage);
  assert.equal(loadGameSave(storage).chapterTwoSeeds[6], restored.chapterTwoSeeds[6]);
  const kept = resetGameSession(restored, true);
  const cleared = resetGameSession(kept, false);

  assert.notEqual(kept.chapterTwoSeeds[6], restored.chapterTwoSeeds[6]);
  assert.deepEqual(kept.design, draft);
  assert.deepEqual(kept.scenario, createOrderScenario(6, kept.chapterTwoSeeds[6]));
  assert.notEqual(cleared.chapterTwoSeeds[6], kept.chapterTwoSeeds[6]);
  assert.deepEqual(cleared.design, { devices: {}, connections: [] });
  assert.deepEqual(cleared.drafts[6], { devices: {}, connections: [] });
  assert.deepEqual(cleared.state, createProductionState(
    cleared.design,
    LEVELS[6],
    createOrderScenario(6, cleared.chapterTwoSeeds[6]),
  ));
});

test("switching levels immediately after a retry keeps the new seed", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 7,
    activeLevelId: 6,
    bestResults: {},
    drafts: { 6: draft },
    chapterTwoSeeds: { 6: 1606, 7: 1707 },
  });
  const retried = resetGameSession(restoreGameSession(storage), true);
  const retrySeed = retried.chapterTwoSeeds[6];

  const onLevelSeven = selectGameLevel(storage, retried, 7).session;
  const backOnLevelSix = selectGameLevel(storage, onLevelSeven, 6).session;

  assert.notEqual(retrySeed, 1606);
  assert.equal(backOnLevelSix.chapterTwoSeeds[6], retrySeed);
  assert.deepEqual(backOnLevelSix.scenario, createOrderScenario(6, retrySeed));
});

test("switching levels keeps in-memory drafts and seeds when storage cannot write", () => {
  const raw = serializeGameSave({
    version: SAVE_VERSION,
    unlockedLevel: 7,
    activeLevelId: 6,
    bestResults: {},
    drafts: { 6: draft },
    chapterTwoSeeds: { 6: 1606, 7: 1707 },
  });
  const storageVariants = [
    {
      getItem() { return raw; },
      setItem() { throw new Error("read only"); },
    },
    {
      getItem() { return raw; },
    },
  ];
  const revisedDraft = {
    devices: {
      source: { ...draft.devices.source, x: 72, gridX: 2 },
    },
    connections: [],
  };

  for (const storage of storageVariants) {
    const retried = resetGameSession(restoreGameSession(storage), true);
    const revised = updateGameDesign(retried, revisedDraft);
    const retrySeed = revised.chapterTwoSeeds[6];

    const onLevelSeven = selectGameLevel(storage, revised, 7).session;
    const backOnLevelSix = selectGameLevel(storage, onLevelSeven, 6).session;

    assert.equal(backOnLevelSix.chapterTwoSeeds[6], retrySeed);
    assert.deepEqual(backOnLevelSix.scenario, createOrderScenario(6, retrySeed));
    assert.deepEqual(backOnLevelSix.design, revisedDraft);
  }
});

test("session order actions update only valid running queues", () => {
  const scenario = createOrderScenario(6, 1606);
  const baseState = createProductionState(draft, LEVELS[6], scenario);
  const waitingState = {
    ...baseState,
    mode: "running",
    orders: baseState.orders.map((order, index) =>
      index < 2 ? { ...order, status: "waiting" } : order
    ),
  };
  const running = {
    activeLevelId: 6,
    unlockedLevel: 6,
    bestResults: {},
    chapterTwoSeeds: { 6: 1606 },
    scenario,
    design: draft,
    state: waitingState,
  };
  const firstId = waitingState.orders[0].id;
  const secondId = waitingState.orders[1].id;

  const firstQueued = enqueueSessionOrder(running, firstId);
  const secondQueued = enqueueSessionOrder(firstQueued, secondId);
  const reordered = moveSessionQueuedOrder(secondQueued, secondId, 0);

  assert.deepEqual(firstQueued.state.queue, [firstId]);
  assert.deepEqual(secondQueued.state.queue, [firstId, secondId]);
  assert.deepEqual(reordered.state.queue, [secondId, firstId]);
  assert.strictEqual(enqueueSessionOrder(running, "missing-order"), running);
  assert.strictEqual(moveSessionQueuedOrder(firstQueued, firstId, 0), firstQueued);
  assert.strictEqual(enqueueSessionOrder({ ...running, state: baseState }, firstId).state, baseState);
  const paused = {
    ...running,
    state: { ...waitingState, mode: "paused" },
  };
  assert.strictEqual(enqueueSessionOrder(paused, firstId), paused);
  for (const invalidIndex of [Number.NaN, Infinity, -Infinity, 0.5]) {
    assert.strictEqual(
      moveSessionQueuedOrder(secondQueued, secondId, invalidIndex),
      secondQueued,
    );
  }
});

test("switching to an unlocked level restores its draft as a fresh design session", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: { 2: draft },
    chapterTwoSeeds: {},
  });
  const current = {
    ...restoreGameSession(storage),
    unlockedLevel: 2,
    bestResults: { 1: { elapsed: 41.5, completed: 10 } },
    editedWhilePaused: true,
    recordBroken: true,
  };

  const switched = selectGameLevel(storage, current, 2);

  assert.equal(switched.accepted, true);
  assert.equal(switched.session.activeLevelId, 2);
  assert.deepEqual(switched.session.design, draft);
  assert.equal(switched.session.state.mode, "design");
  assert.equal(switched.session.unlockedLevel, 2);
  assert.deepEqual(switched.session.bestResults, { 1: { elapsed: 41.5, completed: 10 } });
  assert.equal(switched.session.editedWhilePaused, false);
  assert.equal(switched.session.recordBroken, false);
});

test("editing a paused session makes its next start a fresh production attempt", () => {
  const pausedState = { ...createProductionState(draft), mode: "paused", elapsed: 12, completed: 3 };
  const session = {
    activeLevelId: 1,
    unlockedLevel: 1,
    bestResults: {},
    design: draft,
    state: pausedState,
    editedWhilePaused: false,
    recordBroken: false,
  };
  const revisedDesign = { devices: {}, connections: [] };

  const revised = updateGameDesign(session, revisedDesign);
  const restarted = startGameSession(revised, LEVELS[1]);

  assert.equal(revised.state, pausedState);
  assert.equal(revised.editedWhilePaused, true);
  assert.equal(restarted.state.mode, "running");
  assert.equal(restarted.state.elapsed, 0);
  assert.equal(restarted.state.completed, 0);
  assert.equal(restarted.editedWhilePaused, false);
});

test("starting a chapter-two session keeps it out of the legacy production mode", () => {
  const session = {
    activeLevelId: 6,
    unlockedLevel: 6,
    bestResults: {},
    design: draft,
    state: createProductionState(draft),
    editedWhilePaused: false,
    recordBroken: false,
  };

  const restarted = startGameSession(session, LEVELS[6]);

  assert.equal(restarted.state.mode, "design");
  assert.equal(restarted.state.elapsed, 0);
  assert.equal(restarted.state.completed, 0);
  assert.equal(restarted.editedWhilePaused, false);
});

test("resetting a session without its layout creates an empty design attempt", () => {
  const runningState = { ...createProductionState(draft), mode: "running", elapsed: 12, completed: 3 };
  const session = {
    activeLevelId: 1,
    unlockedLevel: 1,
    bestResults: {},
    drafts: { 1: draft },
    design: draft,
    state: runningState,
    editedWhilePaused: true,
    recordBroken: true,
  };

  const reset = resetGameSession(session, false);

  assert.deepEqual(reset.design, { devices: {}, connections: [] });
  assert.deepEqual(reset.drafts[1], { devices: {}, connections: [] });
  assert.equal(reset.state.mode, "design");
  assert.equal(reset.state.elapsed, 0);
  assert.equal(reset.editedWhilePaused, false);
  assert.equal(reset.recordBroken, false);
});

test("a running session persists only its stable progress fields", () => {
  const running = {
    activeLevelId: 2,
    unlockedLevel: 2,
    bestResults: { 1: { elapsed: 41.5, completed: 10 } },
    chapterTwoSeeds: {},
    design: draft,
    state: { ...createProductionState(draft), mode: "running", elapsed: 12, completed: 3 },
    editedWhilePaused: false,
    recordBroken: false,
  };

  const persisted = toPersistedGameSession(running);

  assert.deepEqual(persisted, {
    activeLevelId: 2,
    unlockedLevel: 2,
    bestResults: { 1: { elapsed: 41.5, completed: 10 } },
    chapterTwoSeeds: {},
    drafts: {},
    design: draft,
    state: { mode: "running" },
  });
});
