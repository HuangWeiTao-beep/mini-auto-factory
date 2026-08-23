import { getMaintenanceFeedback } from "./maintenance-feedback.mjs";
import { getSchedulingFeedback } from "./scheduling-feedback.mjs";

let latestOperationsFeedback = null;

function withoutPassiveIdentifier(recommendation) {
  if (recommendation.kind === "route" || recommendation.kind === "monitor" || recommendation.kind === "stable") {
    return { kind: recommendation.kind, message: recommendation.message };
  }
  return recommendation;
}

function isAtRiskOrderRecommendation(scheduling) {
  const orderId = scheduling.recommendation.orderId;
  if (!orderId) return false;
  const status = scheduling.orders.find((entry) => entry.id === orderId)?.forecast?.status;
  return status === "late" || status === "danger";
}

function chooseRecommendation(scheduling, maintenance) {
  const schedulingRecommendation = scheduling.recommendation;
  const maintenanceRecommendation = maintenance.recommendation;

  if (schedulingRecommendation.kind === "route") {
    return withoutPassiveIdentifier(schedulingRecommendation);
  }

  const brokenMachine = maintenance.machines.find((machine) => machine.reliabilityStatus === "broken");
  if (maintenanceRecommendation.kind === "prioritizeRepair" || brokenMachine) {
    return withoutPassiveIdentifier(maintenanceRecommendation);
  }

  if (isAtRiskOrderRecommendation(scheduling)) {
    return withoutPassiveIdentifier(schedulingRecommendation);
  }

  if (maintenanceRecommendation.kind === "scheduleMaintenance") {
    return withoutPassiveIdentifier(maintenanceRecommendation);
  }

  if (schedulingRecommendation.kind !== "stable") {
    return withoutPassiveIdentifier(schedulingRecommendation);
  }

  if (maintenanceRecommendation.kind === "monitor") {
    return withoutPassiveIdentifier(maintenanceRecommendation);
  }

  return { kind: "stable", message: "运营平稳：目前没有高风险订单或设备。" };
}

export function getOperationsFeedback({
  design,
  level,
  state,
  orders,
  queue,
  elapsed,
  cacheKey = null,
}) {
  if (
    cacheKey
    && latestOperationsFeedback?.cacheKey === cacheKey
    && latestOperationsFeedback.design === design
    && latestOperationsFeedback.level === level
  ) {
    return latestOperationsFeedback.feedback;
  }

  const scheduling = getSchedulingFeedback({
    design,
    level,
    state,
    orders,
    queue,
    elapsed,
    cacheKey,
  });
  const maintenance = getMaintenanceFeedback({ state, design, level });
  const feedback = {
    scheduling,
    maintenance,
    recommendation: chooseRecommendation(scheduling, maintenance),
  };
  if (cacheKey) latestOperationsFeedback = { cacheKey, design, level, feedback };
  return feedback;
}
