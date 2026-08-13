export function getPlayerFeedback(mode, warning, latestFeedback) {
  return mode === "running"
    ? warning ?? latestFeedback
    : latestFeedback ?? warning ?? "";
}
