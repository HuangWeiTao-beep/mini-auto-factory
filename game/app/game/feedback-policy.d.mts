import type { GameMode, OrderFailure } from "./factory-model.mjs";

export function getPlayerFeedback(
  mode: GameMode,
  warning: string | null,
  latestFeedback: string,
): string;

export function getFailureDiagnostic(
  warning: string | null,
  contextualFeedback: string | null | undefined,
  routeHint: string,
  orderFailure?: OrderFailure | null,
): string;
