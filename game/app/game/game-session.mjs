import { createEmptyDesign, createProductionState } from "./factory-model.mjs";
import { clearGameSave, loadGameSave, saveGameSave } from "./game-save.mjs";

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
