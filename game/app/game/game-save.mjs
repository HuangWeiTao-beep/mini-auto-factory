export const SAVE_VERSION = 1;
export const SAVE_STORAGE_KEY = "mini-factory-save";

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function createDefaultSaveState() {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    bestResults: {},
    drafts: {},
  };
}

export const DEFAULT_SAVE_STATE = Object.freeze(createDefaultSaveState());

function isValidResult(result) {
  return (
    isRecord(result) &&
    typeof result.elapsed === "number" &&
    Number.isFinite(result.elapsed) &&
    result.elapsed >= 0 &&
    typeof result.completed === "number" &&
    Number.isInteger(result.completed) &&
    result.completed >= 0
  );
}

function isValidDraft(draft) {
  return isRecord(draft) && isRecord(draft.devices) && Array.isArray(draft.connections);
}

function isValidSaveState(value) {
  if (!isRecord(value)) return false;
  if (value.version !== SAVE_VERSION) return false;
  if (!Number.isInteger(value.unlockedLevel) || value.unlockedLevel < 1) return false;
  if (value.unlockedLevel > 5 || !isRecord(value.bestResults) || !isRecord(value.drafts)) return false;
  return (
    Object.values(value.bestResults).every(isValidResult) &&
    Object.values(value.drafts).every(isValidDraft)
  );
}

function clone(value) {
  return structuredClone(value);
}

export function parseGameSave(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return createDefaultSaveState();
  try {
    const parsed = JSON.parse(raw);
    return isValidSaveState(parsed) ? clone(parsed) : createDefaultSaveState();
  } catch {
    return createDefaultSaveState();
  }
}

export function serializeGameSave(state) {
  return JSON.stringify(isValidSaveState(state) ? state : createDefaultSaveState());
}

function resolveStorage(storage) {
  if (storage && typeof storage.getItem === "function") return storage;
  if (typeof globalThis.localStorage !== "undefined") return globalThis.localStorage;
  return null;
}

export function loadGameSave(storage, key = SAVE_STORAGE_KEY) {
  const target = resolveStorage(storage);
  if (!target) return createDefaultSaveState();
  try {
    return parseGameSave(target.getItem(key));
  } catch {
    return createDefaultSaveState();
  }
}

export function saveGameSave(storage, state, key = SAVE_STORAGE_KEY) {
  const target = resolveStorage(storage);
  const next = isValidSaveState(state) ? clone(state) : createDefaultSaveState();
  if (target && typeof target.setItem === "function") {
    try { target.setItem(key, JSON.stringify(next)); } catch { /* storage may be unavailable */ }
  }
  return next;
}

export function clearGameSave(storage, key = SAVE_STORAGE_KEY) {
  const target = resolveStorage(storage);
  if (target && typeof target.removeItem === "function") {
    try { target.removeItem(key); } catch { /* storage may be unavailable */ }
  }
  return createDefaultSaveState();
}

export const loadSave = loadGameSave;
export const saveSave = saveGameSave;
export const clearSave = clearGameSave;
