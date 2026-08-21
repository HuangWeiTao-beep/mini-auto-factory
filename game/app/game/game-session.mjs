import { createEmptyDesign, createProductionState } from "./factory-model.mjs";
import { loadGameSave, saveGameSave } from "./game-save.mjs";

export function recordBestResult(bestResults, levelId, result) {
  const previous = bestResults[levelId];
  if (previous && previous.elapsed <= result.elapsed) return bestResults;
  return { ...bestResults, [levelId]: result };
}

export function restoreGameSession(storage, activeLevelId = 1) {
  const save = loadGameSave(storage);
  const design = save.drafts[activeLevelId] ?? createEmptyDesign();
  return {
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
    bestResults: session.bestResults,
    drafts,
  });
}
