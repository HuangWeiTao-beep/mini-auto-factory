import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SAVE_STATE,
  SAVE_VERSION,
  clearGameSave,
  createDefaultSaveState,
  loadGameSave,
  parseGameSave,
  saveGameSave,
  serializeGameSave,
} from "../app/game/game-save.mjs";

function memoryStorage(initial = null) {
  let value = initial;
  return {
    getItem() { return value; },
    setItem(_key, next) { value = next; },
    removeItem() { value = null; },
  };
}

test("default save state starts at level one with no records or drafts", () => {
  assert.deepEqual(createDefaultSaveState(), DEFAULT_SAVE_STATE);
  assert.deepEqual(DEFAULT_SAVE_STATE, {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    bestResults: {},
    drafts: {},
  });
});

test("save serializes and loads the versioned progress shape", () => {
  const storage = memoryStorage();
  const state = {
    version: SAVE_VERSION,
    unlockedLevel: 3,
    bestResults: { 1: { elapsed: 36.5, completed: 10 } },
    drafts: { 2: { devices: {}, connections: [] } },
  };

  saveGameSave(storage, state);
  assert.deepEqual(loadGameSave(storage), state);
  assert.deepEqual(parseGameSave(serializeGameSave(state)), state);
});

test("missing, malformed, incompatible, and corrupted saves fall back safely", () => {
  const invalidValues = [
    null,
    "not json",
    JSON.stringify({ version: SAVE_VERSION + 1 }),
    JSON.stringify({ version: SAVE_VERSION, unlockedLevel: 0, bestResults: {}, drafts: {} }),
    JSON.stringify({ version: SAVE_VERSION, unlockedLevel: 1, bestResults: [], drafts: {} }),
    JSON.stringify({ version: SAVE_VERSION, unlockedLevel: 1, bestResults: {}, drafts: { 1: null } }),
  ];

  for (const raw of invalidValues) {
    const storage = memoryStorage(raw);
    assert.deepEqual(loadGameSave(storage), DEFAULT_SAVE_STATE);
    assert.deepEqual(parseGameSave(raw), DEFAULT_SAVE_STATE);
  }
});

test("clearing a save removes progress and returns a fresh default object", () => {
  const storage = memoryStorage(serializeGameSave({
    version: SAVE_VERSION,
    unlockedLevel: 2,
    bestResults: {},
    drafts: {},
  }));

  assert.deepEqual(clearGameSave(storage), DEFAULT_SAVE_STATE);
  assert.deepEqual(loadGameSave(storage), DEFAULT_SAVE_STATE);
});
