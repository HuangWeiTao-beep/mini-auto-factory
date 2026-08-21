import { LEVELS, createEmptyDesign, createProductionState, nextUnlockedLevel, startProduction } from "./factory-model.mjs";
import { clearGameSave, loadGameSave, saveGameSave } from "./game-save.mjs";
import { markDesignEdited } from "./production-controls.mjs";

export function recordBestResult(bestResults, levelId, result) {
  const previous = bestResults[levelId];
  if (previous && previous.elapsed <= result.elapsed) return bestResults;
  return { ...bestResults, [levelId]: result };
}

export function restoreGameSession(storage, selectedLevelId) {
  const save = loadGameSave(storage);
  const activeLevelId = selectedLevelId ?? save.activeLevelId;
  const design = save.drafts[activeLevelId] ?? createEmptyDesign();
  return {
    activeLevelId,
    unlockedLevel: save.unlockedLevel,
    bestResults: save.bestResults,
    design,
    state: createProductionState(design),
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
  const restored = restoreGameSession(storage, levelId);
  return {
    accepted: true,
    session: {
      ...restored,
      unlockedLevel: session.unlockedLevel,
      bestResults: session.bestResults,
      editedWhilePaused: false,
      recordBroken: false,
    },
  };
}

export function updateGameDesign(session, nextDesign) {
  if (nextDesign === session.design) return session;
  return {
    ...session,
    design: nextDesign,
    state: session.state.mode === "paused" ? session.state : createProductionState(nextDesign),
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
  return {
    ...session,
    design,
    state: createProductionState(design),
    editedWhilePaused: false,
    recordBroken: false,
  };
}

export function toPersistedGameSession(session) {
  return {
    activeLevelId: session.activeLevelId,
    unlockedLevel: session.unlockedLevel,
    bestResults: session.bestResults,
    design: session.design,
    state: { mode: session.state.mode },
  };
}

export function saveGameSession(storage, session) {
  const previous = loadGameSave(storage);
  const drafts = session.state.mode === "running"
    ? previous.drafts
    : { ...previous.drafts, [session.activeLevelId]: session.design };
  return saveGameSave(storage, {
    version: previous.version,
    unlockedLevel: session.unlockedLevel,
    activeLevelId: session.activeLevelId,
    bestResults: session.bestResults,
    drafts,
  });
}

export function clearGameSession(storage) {
  clearGameSave(storage);
  return restoreGameSession(storage, 1);
}

export function resolveClearProgressDecision(confirmed, currentSession, clearSession) {
  return confirmed ? clearSession() : currentSession;
}
