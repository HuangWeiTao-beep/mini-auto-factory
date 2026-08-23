import {
  LEVELS,
  createOrderScenario,
  createEmptyDesign,
  createProductionState,
  enqueueProductionOrder,
  isOrderSchedulingLevel,
  moveProductionOrder,
  nextUnlockedLevel,
  startProduction,
} from "./factory-model.mjs";
import { clearGameSave, loadGameSave, saveGameSave } from "./game-save.mjs";
import { markDesignEdited } from "./production-controls.mjs";

let fallbackSeedCounter = 0;

export function generateOrderScenarioSeed(previousSeed, cryptoSource) {
  let seed;
  try {
    const source = cryptoSource ?? globalThis.crypto;
    if (typeof source?.getRandomValues === "function") {
      const values = new Uint32Array(1);
      source.getRandomValues(values);
      seed = values[0];
    }
  } catch {
    // Time plus a monotonic counter keeps retries distinct when crypto is blocked.
  }
  if (seed === undefined) {
    fallbackSeedCounter = (fallbackSeedCounter + 1) >>> 0;
    seed = ((Date.now() >>> 0) + fallbackSeedCounter) >>> 0;
  }
  return seed === previousSeed ? (seed + 1) >>> 0 : seed;
}

function createSessionScenario(level, seed) {
  return isOrderSchedulingLevel(level)
    ? createOrderScenario(level.id, seed)
    : null;
}

function updateStableDraft(session, design) {
  return {
    ...(session.drafts ?? {}),
    [session.activeLevelId]: design,
  };
}

export function recordBestResult(bestResults, levelId, result) {
  const previous = bestResults[levelId];
  if (previous && previous.elapsed <= result.elapsed) return bestResults;
  return { ...bestResults, [levelId]: result };
}

export function restoreGameSession(storage, selectedLevelId) {
  let save = loadGameSave(storage);
  const activeLevelId = selectedLevelId ?? save.activeLevelId;
  const level = LEVELS[activeLevelId];
  let orderScenarioSeeds = save.orderScenarioSeeds;
  if (isOrderSchedulingLevel(level) && orderScenarioSeeds[activeLevelId] === undefined) {
    orderScenarioSeeds = {
      ...orderScenarioSeeds,
      [activeLevelId]: generateOrderScenarioSeed(),
    };
    save = saveGameSave(storage, { ...save, orderScenarioSeeds });
    orderScenarioSeeds = save.orderScenarioSeeds;
  }
  const design = save.drafts[activeLevelId] ?? createEmptyDesign();
  const scenario = createSessionScenario(level, orderScenarioSeeds[activeLevelId]);
  return {
    activeLevelId,
    unlockedLevel: save.unlockedLevel,
    bestResults: save.bestResults,
    drafts: save.drafts,
    orderScenarioSeeds,
    scenario,
    design,
    state: createProductionState(design, level, scenario),
  };
}

export function shouldShowOnboardingAfterRestore(session) {
  return session.activeLevelId === 1;
}

export function applyProductionState(session, nextState, level) {
  const nextBestResults = nextState.mode === "success"
    ? recordBestResult(session.bestResults, session.activeLevelId, {
        elapsed: nextState.elapsed,
        completed: nextState.completed,
      })
    : session.bestResults;
  const recordBroken = nextState.mode !== "success"
    ? false
    : nextBestResults !== session.bestResults || session.recordBroken;
  return {
    ...session,
    state: nextState,
    unlockedLevel: session.state.mode !== "success" && nextState.mode === "success"
      ? nextUnlockedLevel(session.unlockedLevel, level.id)
      : session.unlockedLevel,
    bestResults: nextBestResults,
    recordBroken,
  };
}

export function selectGameLevel(storage, session, levelId) {
  if (!LEVELS[levelId] || levelId > session.unlockedLevel) {
    return { accepted: false, session };
  }
  const persisted = saveGameSession(storage, session);
  const restored = restoreGameSession(storage, levelId);
  const drafts = { ...restored.drafts, ...persisted.drafts };
  const orderScenarioSeeds = {
    ...restored.orderScenarioSeeds,
    ...persisted.orderScenarioSeeds,
  };
  const level = LEVELS[levelId];
  const design = drafts[levelId] ?? createEmptyDesign();
  const scenario = createSessionScenario(level, orderScenarioSeeds[levelId]);
  return {
    accepted: true,
    session: {
      ...restored,
      unlockedLevel: persisted.unlockedLevel,
      bestResults: persisted.bestResults,
      drafts,
      orderScenarioSeeds,
      scenario,
      design,
      state: createProductionState(design, level, scenario),
      editedWhilePaused: false,
      recordBroken: false,
    },
  };
}

export function updateGameDesign(session, nextDesign) {
  if (nextDesign === session.design) return session;
  const level = LEVELS[session.activeLevelId];
  return {
    ...session,
    design: nextDesign,
    drafts: session.state.mode === "running"
      ? session.drafts ?? {}
      : updateStableDraft(session, nextDesign),
    state: session.state.mode === "paused"
      ? session.state
      : createProductionState(nextDesign, level, session.scenario),
    editedWhilePaused: markDesignEdited(
      session.state.mode,
      session.editedWhilePaused,
      session.design,
      nextDesign,
    ),
  };
}

export function startGameSession(session, level) {
  return {
    ...session,
    state: startProduction(session.state, {
      edited: session.editedWhilePaused,
      design: session.design,
      level,
    }),
    editedWhilePaused: false,
    recordBroken: false,
  };
}

export function resetGameSession(session, keepDesign) {
  const design = keepDesign ? session.design : createEmptyDesign();
  const level = LEVELS[session.activeLevelId];
  if (isOrderSchedulingLevel(level)) {
    const previousSeed = session.orderScenarioSeeds?.[session.activeLevelId]
      ?? session.state.scenarioSeed;
    const seed = generateOrderScenarioSeed(previousSeed);
    const orderScenarioSeeds = {
      ...(session.orderScenarioSeeds ?? {}),
      [session.activeLevelId]: seed,
    };
    const scenario = createSessionScenario(level, seed);
    return {
      ...session,
      orderScenarioSeeds,
      scenario,
      design,
      drafts: updateStableDraft(session, design),
      state: createProductionState(design, level, scenario),
      editedWhilePaused: false,
      recordBroken: false,
    };
  }
  const scenario = createSessionScenario(level);
  return {
    ...session,
    design,
    drafts: updateStableDraft(session, design),
    scenario,
    state: createProductionState(design, level, scenario),
    editedWhilePaused: false,
    recordBroken: false,
  };
}

export function enqueueSessionOrder(session, orderId) {
  if (session.state.mode !== "running") return session;
  const state = enqueueProductionOrder(session.state, orderId);
  return state === session.state ? session : { ...session, state };
}

export function moveSessionQueuedOrder(session, orderId, nextIndex) {
  if (!Number.isFinite(nextIndex) || !Number.isInteger(nextIndex)) return session;
  if (session.state.mode !== "running") return session;
  const state = moveProductionOrder(session.state, orderId, nextIndex);
  return state === session.state ? session : { ...session, state };
}

export function prioritizeSessionOrder(session, orderId) {
  if (session.state.mode !== "running") return session;
  const enqueued = enqueueProductionOrder(session.state, orderId);
  const state = moveProductionOrder(enqueued, orderId, 0);
  return state === session.state ? session : { ...session, state };
}

export function toPersistedGameSession(session) {
  return {
    activeLevelId: session.activeLevelId,
    unlockedLevel: session.unlockedLevel,
    bestResults: session.bestResults,
    drafts: session.drafts ?? {},
    orderScenarioSeeds: session.orderScenarioSeeds ?? {},
    design: session.design,
    state: { mode: session.state.mode },
  };
}

export function saveGameSession(storage, session) {
  const previous = loadGameSave(storage);
  const stableDrafts = { ...previous.drafts, ...(session.drafts ?? {}) };
  const drafts = session.state.mode === "running"
    ? stableDrafts
    : { ...stableDrafts, [session.activeLevelId]: session.design };
  return saveGameSave(storage, {
    version: previous.version,
    unlockedLevel: session.unlockedLevel,
    activeLevelId: session.activeLevelId,
    bestResults: session.bestResults,
    drafts,
    orderScenarioSeeds: session.orderScenarioSeeds ?? previous.orderScenarioSeeds,
  });
}

export function clearGameSession(storage) {
  clearGameSave(storage);
  return restoreGameSession(storage, 1);
}

export function resolveClearProgressDecision(confirmed, currentSession, clearSession) {
  return confirmed ? clearSession() : currentSession;
}
