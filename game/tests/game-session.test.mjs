import assert from "node:assert/strict";
import test from "node:test";

import { SAVE_VERSION, loadGameSave, saveGameSave } from "../app/game/game-save.mjs";
import { createProductionState } from "../app/game/factory-model.mjs";
import {
  recordBestResult,
  restoreGameSession,
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

  assert.deepEqual(restoreGameSession(storage, 2).design, draft);
});

test("a faster successful run replaces the best result while a slower run does not", () => {
  const current = { 1: { elapsed: 42.5, completed: 10 } };

  assert.deepEqual(recordBestResult(current, 1, { elapsed: 38.2, completed: 10 }), {
    1: { elapsed: 38.2, completed: 10 },
  });
  assert.deepEqual(recordBestResult(current, 1, { elapsed: 49.7, completed: 10 }), current);
});
