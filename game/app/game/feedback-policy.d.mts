import type { GameMode } from "./factory-model.mjs";

export function getPlayerFeedback(
  mode: GameMode,
  warning: string | null,
  latestFeedback: string,
): string;
