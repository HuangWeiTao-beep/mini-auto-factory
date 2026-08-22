import { PRODUCTS } from "./order-scheduling.mjs";

export function getPlayerFeedback(mode, warning, latestFeedback) {
  return mode === "running"
    ? warning ?? latestFeedback
    : latestFeedback ?? warning ?? "";
}

export function getFailureDiagnostic(
  warning,
  contextualFeedback,
  routeHint,
  orderFailure = null,
) {
  if (orderFailure) {
    const product = PRODUCTS[orderFailure.productId];
    const productLabel = product?.label ?? orderFailure.productId;
    return `订单 ${orderFailure.orderId}（${productLabel}）已超时 ${orderFailure.overdueSeconds} 秒。`;
  }
  return contextualFeedback ?? warning ?? routeHint;
}
