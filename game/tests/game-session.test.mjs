import assert from "node:assert/strict";
import test from "node:test";

import { SAVE_VERSION, loadGameSave, saveGameSave } from "../app/game/game-save.mjs";
import { LEVELS, createProductionState } from "../app/game/factory-model.mjs";
import {
  applyProductionState,
  clearGameSession,
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

test("restoring the second level keeps its saved draft in design mode without level-one onboarding", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 2,
    activeLevelId: 2,
    bestResults: {},
    drafts: { 2: draft },
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
  });

  const session = clearGameSession(storage);

  assert.deepEqual(loadGameSave(storage), {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: {},
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

test("switching to an unlocked level restores its draft as a fresh design session", () => {
  const storage = memoryStorage();
  saveGameSave(storage, {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: { 2: draft },
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
    design: draft,
    state: runningState,
    editedWhilePaused: true,
    recordBroken: true,
  };

  const reset = resetGameSession(session, false);

  assert.deepEqual(reset.design, { devices: {}, connections: [] });
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
    design: draft,
    state: { mode: "running" },
  });
});
