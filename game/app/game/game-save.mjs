export const SAVE_VERSION = 3;
export const SAVE_STORAGE_KEY = "mini-factory-save";
const MAX_SAVE_LEVEL_ID = 15;
const MAX_LEGACY_SAVE_LEVEL_ID = 10;
const ORDER_SCENARIO_LEVEL_IDS = new Set([6, 7, 8, 9, 10, 13, 14, 15]);
const MAX_SEED = 0xffffffff;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function createDefaultSaveState() {
  return {
    version: SAVE_VERSION,
    unlockedLevel: 1,
    activeLevelId: 1,
    bestResults: {},
    drafts: {},
    orderScenarioSeeds: {},
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
  if (value.version !== 1 && value.version !== 2 && value.version !== SAVE_VERSION) return false;
  if (!Number.isInteger(value.unlockedLevel) || value.unlockedLevel < 1) return false;
  if (
    (value.version === SAVE_VERSION && value.unlockedLevel > MAX_SAVE_LEVEL_ID) ||
    !isRecord(value.bestResults) ||
    !isRecord(value.drafts)
  ) return false;
  return (
    Object.values(value.bestResults).every(isValidResult) &&
    Object.values(value.drafts).every(isValidDraft)
  );
}

function normalizeOrderScenarioSeeds(value, maxLevelId = MAX_SAVE_LEVEL_ID) {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(([levelId, seed]) => {
      const numericLevelId = Number(levelId);
      return (
        Number.isInteger(numericLevelId) &&
        String(numericLevelId) === levelId &&
        ORDER_SCENARIO_LEVEL_IDS.has(numericLevelId) &&
        numericLevelId <= maxLevelId &&
        Number.isInteger(seed) &&
        seed >= 0 &&
        seed <= MAX_SEED
      );
    }),
  );
}

function normalizeLevelRecords(records, maxLevelId) {
  return Object.fromEntries(
    Object.entries(records).filter(([levelId]) => {
      const numericLevelId = Number(levelId);
      return Number.isInteger(numericLevelId) &&
        String(numericLevelId) === levelId &&
        numericLevelId >= 1 &&
        numericLevelId <= maxLevelId;
    }),
  );
}

function normalizedActiveLevelId(activeLevelId, unlockedLevel) {
  return Number.isInteger(activeLevelId) &&
    activeLevelId >= 1 &&
    activeLevelId <= unlockedLevel &&
    activeLevelId <= MAX_SAVE_LEVEL_ID
    ? activeLevelId
    : 1;
}

function normalizeSaveState(state) {
  const maxLevelId = state.version === SAVE_VERSION
    ? MAX_SAVE_LEVEL_ID
    : MAX_LEGACY_SAVE_LEVEL_ID;
  const unlockedLevel = Math.min(state.unlockedLevel, maxLevelId);
  return {
    version: SAVE_VERSION,
    unlockedLevel,
    activeLevelId: normalizedActiveLevelId(state.activeLevelId, unlockedLevel),
    bestResults: normalizeLevelRecords(state.bestResults, maxLevelId),
    drafts: normalizeLevelRecords(state.drafts, maxLevelId),
    orderScenarioSeeds: state.version === 1
      ? {}
      : normalizeOrderScenarioSeeds(
        state.version === 2 ? state.chapterTwoSeeds : state.orderScenarioSeeds,
        maxLevelId,
      ),
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
