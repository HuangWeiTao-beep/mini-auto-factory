import type { FactoryDesign, GameMode, LevelConfig } from "./factory-model.mjs";

export function markDesignEdited(
  mode: GameMode,
  editedWhilePaused: boolean,
  previousDesign: FactoryDesign,
  nextDesign: FactoryDesign,
): boolean;

export function getProductionActionLabel(
  mode: GameMode,
  editedWhilePaused: boolean,
): "开始生产" | "继续生产" | "重新开始生产";

export function getSuccessSettlement(
  level: LevelConfig,
  maxLevelId: number,
): { message: string; nextLevelId: number | null };
