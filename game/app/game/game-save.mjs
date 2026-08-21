export const SAVE_VERSION = 1;
export const SAVE_STORAGE_KEY = "mini-factory-save";

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function createDefaultSaveState() {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
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

function normalizedActiveLevelId(activeLevelId, unlockedLevel) {
  return Number.isInteger(activeLevelId) &&
    activeLevelId >= 1 &&
    activeLevelId <= unlockedLevel &&
    activeLevelId <= 5
    ? activeLevelId
    : 1;
}

function normalizeSaveState(state) {
  return {
    ...state,
    activeLevelId: normalizedActiveLevelId(state.activeLevelId, state.unlockedLevel),
  };
}

function cloneOrNull(value) {
  try {
    return structuredClone(value);
  } catch {
    return null;
  }
}

export function parseGameSave(raw) {
  if (typeof raw !== "string" || raw.trim() === "") return createDefaultSaveState();
  try {
    const parsed = JSON.parse(raw);
    if (!isValidSaveState(parsed)) return createDefaultSaveState();
    const cloned = cloneOrNull(parsed);
    return cloned ? normalizeSaveState(cloned) : createDefaultSaveState();
  } catch {
    return createDefaultSaveState();
  }
}

export function serializeGameSave(state) {
  if (!isValidSaveState(state)) return JSON.stringify(createDefaultSaveState());
  try {
    return JSON.stringify(normalizeSaveState(state));
  } catch {
    return JSON.stringify(createDefaultSaveState());
  }
}

function resolveStorage(storage) {
  try {
    const candidate = storage ?? globalThis.localStorage;
    return candidate && typeof candidate.getItem === "function" ? candidate : null;
  } catch {
    return null;
  }
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
  if (!isValidSaveState(state)) return createDefaultSaveState();
  const cloned = cloneOrNull(state);
  const next = cloned && normalizeSaveState(cloned);
  if (!next) return createDefaultSaveState();
  let serialized;
  try {
    serialized = JSON.stringify(next);
  } catch {
    // Invalid data or unavailable storage must not replace an existing save.
    return createDefaultSaveState();
  }
  try {
    if (target && typeof target.setItem === "function") target.setItem(key, serialized);
  } catch { /* storage may be unavailable */ }
  return next;
}

export function clearGameSave(storage, key = SAVE_STORAGE_KEY) {
  const target = resolveStorage(storage);
  try {
    if (target && typeof target.removeItem === "function") target.removeItem(key);
  } catch { /* storage may be unavailable */ }
  return createDefaultSaveState();
}

export const loadSave = loadGameSave;
export const saveSave = saveGameSave;
export const clearSave = clearGameSave;
