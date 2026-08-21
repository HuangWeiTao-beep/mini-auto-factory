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
    activeLevelId: 1,
    bestResults: {},
    drafts: {},
  });
});

test("save serializes and loads the versioned progress shape", () => {
  const storage = memoryStorage();
  const state = {
    version: SAVE_VERSION,
    unlockedLevel: 3,
    activeLevelId: 1,
    bestResults: { 1: { elapsed: 36.5, completed: 10 } },
    drafts: { 2: { devices: {}, connections: [] } },
  };

  saveGameSave(storage, state);
  assert.deepEqual(loadGameSave(storage), state);
  assert.deepEqual(parseGameSave(serializeGameSave(state)), state);
});

test("active level is retained only when it is unlocked and otherwise falls back to level one", () => {
  const base = {
    version: SAVE_VERSION,
    unlockedLevel: 2,
    activeLevelId: 1,
    bestResults: {},
    drafts: {},
  };

  assert.equal(parseGameSave(JSON.stringify({ ...base, activeLevelId: 2 })).activeLevelId, 2);
  assert.equal(parseGameSave(JSON.stringify({ ...base, activeLevelId: 3 })).activeLevelId, 1);
  assert.equal(parseGameSave(JSON.stringify({ ...base, activeLevelId: 0 })).activeLevelId, 1);
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

test("storage getters and methods throwing never escape the save boundary", () => {
  const throwingStorage = {};
  Object.defineProperty(throwingStorage, "getItem", { get() { throw new Error("private mode"); } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
  try {
    assert.deepEqual(loadGameSave(throwingStorage), DEFAULT_SAVE_STATE);
    assert.deepEqual(saveGameSave(throwingStorage, createDefaultSaveState()), DEFAULT_SAVE_STATE);
    assert.deepEqual(clearGameSave(throwingStorage), DEFAULT_SAVE_STATE);
  } finally {
    delete globalThis.localStorage;
  }

  const methodsThrow = {
    getItem() { throw new Error("read"); },
    setItem() { throw new Error("write"); },
    removeItem() { throw new Error("clear"); },
  };
  assert.deepEqual(loadGameSave(methodsThrow), DEFAULT_SAVE_STATE);
  assert.deepEqual(saveGameSave(methodsThrow, createDefaultSaveState()), DEFAULT_SAVE_STATE);
  assert.deepEqual(clearGameSave(methodsThrow), DEFAULT_SAVE_STATE);
});

test("uncloneable saves do not overwrite an existing valid save", () => {
  const valid = {
    version: SAVE_VERSION,
    unlockedLevel: 2,
    activeLevelId: 1,
    bestResults: {},
    drafts: { 1: { devices: {}, connections: [] } },
  };
  let stored = serializeGameSave(valid);
  const storage = {
    getItem() { return stored; },
    setItem(_key, next) { stored = next; },
    removeItem() { stored = null; },
  };
  const cyclic = createDefaultSaveState();
  cyclic.drafts = { 1: { devices: {}, connections: [] } };
  cyclic.drafts[1].connections.push(cyclic.drafts[1]);

  assert.deepEqual(saveGameSave(storage, cyclic), DEFAULT_SAVE_STATE);
  assert.deepEqual(loadGameSave(storage), valid);
  assert.equal(serializeGameSave(cyclic), JSON.stringify(DEFAULT_SAVE_STATE));
});
