import { PRODUCTS } from "./order-scheduling.mjs";
import { manhattanDistance } from "./factory-grid.mjs";
import { forecastOrderCompletionTimes } from "./factory-model.mjs";

const DEVICE_LABELS = Object.freeze({
  source: "钢棒源",
  cutter: "切割机",
  lathe: "车削机",
  drill: "钻孔机",
  coater: "镀层机",
  exit: "成品出口",
});

const round = (value) => Math.round(value * 10) / 10;
let latestLiveFeedback = null;

function transportDuration(level, from, to) {
  return level.transportMode === "distance"
    ? 0.5 * Math.max(1, manhattanDistance(from, to))
    : 0.5;
}

function routeForProduct(design, level, productId) {
  const product = PRODUCTS[productId];
  const devices = Object.values(design.devices ?? {});
  const connections = design.connections ?? [];
  if (!product) return { status: "missing", missingLink: "未知产品" };

  let candidates = devices
    .filter((device) => device.type === product.route[0])
    .map((device) => ({ device, duration: 0 }));
  if (candidates.length === 0) {
    return { status: "missing", missingLink: DEVICE_LABELS[product.route[0]] };
  }

  for (let step = 1; step < product.route.length; step += 1) {
    const nextType = product.route[step];
    const nextCandidates = new Map();
    for (const candidate of candidates) {
      const reachable = connections.filter((connection) => connection.from === candidate.device.id);
      for (const connection of reachable) {
        const target = design.devices?.[connection.to];
        if (!target || target.type !== nextType) continue;
        const duration = candidate.duration
          + transportDuration(level, candidate.device, target)
          + (level.machineDurations?.[nextType] ?? 0);
        const previous = nextCandidates.get(target.id);
        if (!previous || duration < previous.duration) {
          nextCandidates.set(target.id, { device: target, duration });
        }
      }
    }
    if (nextCandidates.size === 0) {
      return {
        status: "missing",
        missingLink: `${DEVICE_LABELS[product.route[step - 1]]} → ${DEVICE_LABELS[nextType]}`,
      };
    }
    candidates = [...nextCandidates.values()];
  }

  const best = candidates.reduce((current, candidate) =>
    candidate.duration < current.duration ? candidate : current,
  );
  return { status: "ready", duration: round(best.duration) };
}

function forecastForOrder(order, route, queue, elapsed, level, completionTimes) {
  if (route.status !== "ready" || order.status === "completed") return null;
  if (order.status === "scheduled") return { status: "scheduled" };
  if (completionTimes?.has(order.id)) {
    const expectedAt = round(completionTimes.get(order.id));
    const slack = round(order.deadlineAt - expectedAt);
    const status = slack < 0 ? "late" : slack <= 2 ? "danger" : slack <= 6 ? "attention" : "safe";
    return { expectedAt, slack, status };
  }
  if (completionTimes) return { status: "blocked" };

  const queuedIndex = queue.indexOf(order.id);
  const position = queuedIndex === -1 ? queue.length : queuedIndex;
  const expectedAt = round(elapsed + route.duration + level.sourceInterval * (position + 1));
  const slack = round(order.deadlineAt - expectedAt);
  const status = slack < 0 ? "late" : slack <= 2 ? "danger" : slack <= 6 ? "attention" : "safe";
  return { expectedAt, slack, status };
}

function recommendationFor(orderFeedback) {
  const missing = orderFeedback.find(
    (entry) => entry.order.status !== "completed" && entry.route.status === "missing",
  );
  if (missing) {
    return {
      kind: "route",
      orderId: missing.order.id,
      message: `${PRODUCTS[missing.order.productId].label}缺少连接：${missing.route.missingLink}`,
    };
  }

  const blocked = orderFeedback.find((entry) => entry.forecast?.status === "blocked");
  if (blocked) {
    return {
      kind: "monitor",
      orderId: blocked.order.id,
      message: `${PRODUCTS[blocked.order.productId].label}预测受阻，请检查下游连接与等待位。`,
    };
  }

  const atRisk = orderFeedback
    .filter((entry) => entry.forecast?.status === "late" || entry.forecast?.status === "danger")
    .sort((left, right) => left.forecast.slack - right.forecast.slack)[0];
  if (!atRisk) {
    return { kind: "stable", orderId: null, message: "排程平稳：目前没有高风险订单。" };
  }

  const product = PRODUCTS[atRisk.order.productId];
  if (atRisk.order.status === "waiting") {
    return {
      kind: "enqueue",
      orderId: atRisk.order.id,
      message: `${product.label}时间紧，建议立即加入生产队列。`,
    };
  }
  if (atRisk.queueIndex > 0) {
    const timing = atRisk.forecast.status === "late"
      ? `预计超时 ${Math.abs(atRisk.forecast.slack).toFixed(1)} 秒`
      : `预计只剩 ${atRisk.forecast.slack.toFixed(1)} 秒余量`;
    return {
      kind: "moveToFront",
      orderId: atRisk.order.id,
      message: `${product.label}${timing}，建议提到队首。`,
    };
  }
  return {
    kind: "monitor",
    orderId: atRisk.order.id,
    message: `${product.label}已经在队首，但交付风险仍高。`,
  };
}

export function getSchedulingFeedback({ design, level, state, orders, queue, elapsed, cacheKey = null }) {
  if (
    cacheKey
    && latestLiveFeedback?.cacheKey === cacheKey
    && latestLiveFeedback.design === design
    && latestLiveFeedback.level === level
  ) {
    return latestLiveFeedback.feedback;
  }
  const routes = new Map();
  const completionTimes = state
    ? forecastOrderCompletionTimes(state, design, level, queue)
    : null;
  const waitingCompletionTimes = new Map(
    state
      ? orders
        .filter((order) => order.status === "waiting")
        .map((order) => [
          order.id,
          forecastOrderCompletionTimes(state, design, level, [order.id, ...queue]),
        ])
      : [],
  );
  const orderFeedback = orders.map((order) => {
    const route = routes.get(order.productId) ?? routeForProduct(design, level, order.productId);
    routes.set(order.productId, route);
    return {
      id: order.id,
      order,
      queueIndex: queue.indexOf(order.id),
      route: route.status === "ready"
        ? { status: "ready" }
        : { status: "missing", missingLink: route.missingLink },
      forecast: forecastForOrder(
        order,
        route,
        queue,
        elapsed,
        level,
        waitingCompletionTimes.get(order.id) ?? completionTimes,
      ),
    };
  });
  const feedback = {
    orders: orderFeedback,
    recommendation: recommendationFor(orderFeedback),
  };
  if (cacheKey) latestLiveFeedback = { cacheKey, design, level, feedback };
  return feedback;
}
