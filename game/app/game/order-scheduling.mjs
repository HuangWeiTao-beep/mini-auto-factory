const PRODUCT_ROUTE_STANDARD = Object.freeze(["source", "cutter", "lathe", "exit"]);
const PRODUCT_ROUTE_PRECISION = Object.freeze([
  "source",
  "cutter",
  "lathe",
  "drill",
  "exit",
]);
const PRODUCT_ROUTE_RUSTPROOF = Object.freeze([
  "source",
  "cutter",
  "lathe",
  "coater",
  "exit",
]);

export const PRODUCTS = Object.freeze({
  standard: Object.freeze({
    id: "standard",
    label: "普通螺栓",
    ariaLabel: "普通螺栓订单",
    colorToken: "order-standard",
    route: PRODUCT_ROUTE_STANDARD,
  }),
  precision: Object.freeze({
    id: "precision",
    label: "精密螺栓",
    ariaLabel: "精密螺栓订单",
    colorToken: "order-precision",
    route: PRODUCT_ROUTE_PRECISION,
  }),
  rustproof: Object.freeze({
    id: "rustproof",
    label: "防锈螺栓",
    ariaLabel: "防锈螺栓订单",
    colorToken: "order-rustproof",
    route: PRODUCT_ROUTE_RUSTPROOF,
  }),
});

const freezeRule = (rule) =>
  Object.freeze({
    ...rule,
    arrivalWindow: Object.freeze([...rule.arrivalWindow]),
    deadlineLeadWindow: Object.freeze([...rule.deadlineLeadWindow]),
    productPool: Object.freeze([...rule.productPool]),
    paletteTypes: Object.freeze([...rule.paletteTypes]),
  });

export const ORDER_SCENARIO_RULES = Object.freeze({
  6: freezeRule({
    orderCount: 6,
    arrivalWindow: [0, 24],
    deadlineLeadWindow: [22, 22],
    productPool: ["standard", "precision"],
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
  }),
  7: freezeRule({
    orderCount: 8,
    arrivalWindow: [0, 30],
    deadlineLeadWindow: [18, 26],
    productPool: ["standard", "precision"],
    paletteTypes: ["source", "cutter", "lathe", "drill", "exit"],
  }),
  8: freezeRule({
    orderCount: 8,
    arrivalWindow: [0, 34],
    deadlineLeadWindow: [24, 32],
    productPool: ["standard", "precision", "rustproof"],
    paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
  }),
  9: freezeRule({
    orderCount: 10,
    arrivalWindow: [0, 42],
    deadlineLeadWindow: [22, 34],
    productPool: ["standard", "precision", "rustproof"],
    paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
  }),
  10: freezeRule({
    orderCount: 12,
    arrivalWindow: [0, 50],
    deadlineLeadWindow: [20, 32],
    productPool: ["standard", "precision", "rustproof"],
    paletteTypes: ["source", "cutter", "lathe", "drill", "coater", "exit"],
  }),
});

const round = (value) => Math.round(value * 1000) / 1000;

function hashSeed(seed) {
  let hash = 2166136261;
  for (const character of String(seed)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pickInt(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function shuffleWithRandom(values, random) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function getScenarioRule(levelId) {
  const rule = ORDER_SCENARIO_RULES[levelId];
  if (!rule) {
    throw new RangeError(`No order scheduling rule for level ${levelId}.`);
  }
  return rule;
}

function buildProductSequence(rule, random) {
  const seededPool = [...rule.productPool];
  const sequence = [];
  while (sequence.length < rule.orderCount) {
    if (seededPool.length === 0) {
      seededPool.push(...shuffleWithRandom(rule.productPool, random));
    }
    sequence.push(seededPool.shift());
  }
  return shuffleWithRandom(sequence, random);
}

function buildArrivalMoments(rule, random) {
  const [minArrival, maxArrival] = rule.arrivalWindow;
  const span = maxArrival - minArrival;
  const arrivals = [];
  for (let index = 0; index < rule.orderCount; index += 1) {
    const chunkStart = minArrival + Math.floor((span * index) / rule.orderCount);
    const chunkEnd =
      index === rule.orderCount - 1
        ? maxArrival
        : minArrival + Math.floor((span * (index + 1)) / rule.orderCount);
    arrivals.push(pickInt(random, chunkStart, Math.max(chunkStart, chunkEnd)));
  }
  return arrivals.sort((left, right) => left - right);
}

function buildOrders(levelId, rule, random) {
  const products = buildProductSequence(rule, random);
  const arrivals = buildArrivalMoments(rule, random);
  return arrivals.map((arrivesAt, index) => {
    const deadlineLead = pickInt(
      random,
      rule.deadlineLeadWindow[0],
      rule.deadlineLeadWindow[1],
    );
    return Object.freeze({
      id: `L${levelId}-${String(index + 1).padStart(2, "0")}`,
      levelId,
      productId: products[index],
      arrivesAt,
      deadlineAt: round(arrivesAt + deadlineLead),
      status: "scheduled",
    });
  });
}

function updateOrder(scenario, orderId, transform) {
  let changed = false;
  const orders = scenario.orders.map((order) => {
    if (order.id !== orderId) return order;
    const nextOrder = transform(order);
    changed ||= nextOrder !== order;
    return nextOrder;
  });
  return changed ? { ...scenario, orders } : scenario;
}

export function getProduct(productId) {
  return PRODUCTS[productId];
}

export function shufflePaletteTypes(paletteTypes, seed) {
  return shuffleWithRandom(paletteTypes, createSeededRandom(`palette:${seed}`));
}

function createScenario(levelId, seed, rule, orders) {
  return Object.freeze({
    levelId,
    seed,
    paletteTypes: Object.freeze(
      shufflePaletteTypes(rule.paletteTypes, `${levelId}:${seed}`),
    ),
    orders: Object.freeze(orders),
    queue: Object.freeze([]),
  });
}

export function createOrderScenarioCandidate(levelId, seed, attempt = 0) {
  const rule = getScenarioRule(levelId);
  const candidateSeed = attempt === 0
    ? `orders:${levelId}:${seed}`
    : `orders:${levelId}:${seed}:attempt:${attempt}`;
  return createScenario(
    levelId,
    seed,
    rule,
    buildOrders(levelId, rule, createSeededRandom(candidateSeed)),
  );
}

export function createSafeOrderScenarioCandidate(levelId, seed, candidateSeed) {
  const rule = getScenarioRule(levelId);
  const random = createSeededRandom(`safe-orders:${levelId}:${candidateSeed}`);
  const products = buildProductSequence(rule, random);
  const [minArrival, maxArrival] = rule.arrivalWindow;
  const arrivalSpan = maxArrival - minArrival;
  const maxDeadlineLead = rule.deadlineLeadWindow[1];
  const orders = products.map((productId, index) => {
    const arrivesAt = rule.orderCount === 1
      ? minArrival
      : Math.round(minArrival + (arrivalSpan * index) / (rule.orderCount - 1));
    return Object.freeze({
      id: `L${levelId}-${String(index + 1).padStart(2, "0")}`,
      levelId,
      productId,
      arrivesAt,
      deadlineAt: round(arrivesAt + maxDeadlineLead),
      status: "scheduled",
    });
  });
  return createScenario(levelId, seed, rule, orders);
}

export function activateArrivedOrders(scenario, elapsed) {
  let changed = false;
  const orders = scenario.orders.map((order) => {
    if (order.status !== "scheduled" || order.arrivesAt > elapsed) return order;
    changed = true;
    return Object.freeze({ ...order, status: "waiting" });
  });
  return changed
    ? Object.freeze({ ...scenario, orders: Object.freeze(orders) })
    : scenario;
}

export function enqueueWaitingOrder(scenario, orderId) {
  if (scenario.queue.includes(orderId)) return scenario;
  const order = scenario.orders.find((candidate) => candidate.id === orderId);
  if (!order || order.status !== "waiting") return scenario;
  const queue = Object.freeze([...scenario.queue, orderId]);
  const queuedScenario = updateOrder(scenario, orderId, (currentOrder) =>
    Object.freeze({ ...currentOrder, status: "queued" }),
  );
  return Object.freeze({ ...queuedScenario, queue });
}

export function moveQueuedOrder(scenario, orderId, nextIndex) {
  const currentIndex = scenario.queue.indexOf(orderId);
  if (currentIndex === -1) return scenario;
  const boundedIndex = Math.max(0, Math.min(nextIndex, scenario.queue.length - 1));
  if (boundedIndex === currentIndex) return scenario;
  const queue = [...scenario.queue];
  queue.splice(currentIndex, 1);
  queue.splice(boundedIndex, 0, orderId);
  return Object.freeze({ ...scenario, queue: Object.freeze(queue) });
}
