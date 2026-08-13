export function getPlayerFeedback(mode, warning, latestFeedback) {
  return mode === "running"
    ? warning ?? latestFeedback
    : latestFeedback ?? warning ?? "";
}

export function getFailureDiagnostic(warning, contextualFeedback, routeHint) {
  return contextualFeedback ?? warning ?? routeHint;
}
