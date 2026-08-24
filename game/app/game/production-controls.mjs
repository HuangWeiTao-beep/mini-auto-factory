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
  const chapterEndLevelId = { 1: 5, 2: 10, 3: 15 }[level.chapter] ?? maxLevelId;
  const completionCopy = level.mode === "orderScheduling"
    ? `${level.name}全部订单按时完成，`
    : `${level.name}稳定运行，`;
  if (level.id === chapterEndLevelId) {
    const chapterName = { 1: "第一章", 2: "第二章", 3: "第三章" }[level.chapter] ?? "本章";
    const nextLevelCopy = nextLevelId ? `第 ${nextLevelId} 关已解锁。` : "";
    return {
      message: `${completionCopy}${chapterName}全部验收通过。${nextLevelCopy}`,
      nextLevelId,
    };
  }
  return {
    message: `${completionCopy}第 ${nextLevelId} 关已解锁。`,
    nextLevelId,
  };
}
