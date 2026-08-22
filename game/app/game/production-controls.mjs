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

export function getSuccessSettlement(level, maxLevelId) {
  const nextLevelId = level.id < maxLevelId ? level.id + 1 : null;
  const chapterEndLevelId = level.chapter === 1 ? 5 : maxLevelId;
  if (level.id === chapterEndLevelId) {
    const chapterName = level.chapter === 1 ? "第一章" : "第二章";
    const nextLevelCopy = nextLevelId ? `第 ${nextLevelId} 关已解锁。` : "";
    return {
      message: `${level.name}稳定运行，${chapterName}全部验收通过。${nextLevelCopy}`,
      nextLevelId,
    };
  }
  return {
    message: `${level.name}稳定运行，第 ${nextLevelId} 关已解锁。`,
    nextLevelId,
  };
}
