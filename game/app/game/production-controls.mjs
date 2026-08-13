export function markDesignEdited(
  mode,
  editedWhilePaused,
  previousDesign,
  nextDesign,
) {
  return editedWhilePaused || (mode === "paused" && nextDesign !== previousDesign);
}

export function getProductionActionLabel(mode, editedWhilePaused) {
  if (mode !== "paused") return "开始生产";
  return editedWhilePaused ? "重新开始生产" : "继续生产";
}
