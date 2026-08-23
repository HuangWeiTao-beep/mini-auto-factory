import type { OrderFailure, ProductId, ProductionOrder } from "./factory-model.mjs";
import type { SchedulingFeedback, SchedulingOrderFeedback } from "./scheduling-feedback.mjs";

type Props = {
  orders: readonly ProductionOrder[];
  queue: readonly string[];
  elapsed: number;
  failure?: OrderFailure | null;
  feedback: SchedulingFeedback | null;
  actionsEnabled: boolean;
  onEnqueue: (orderId: string) => void;
  onMoveUp: (orderId: string) => void;
  onMoveDown: (orderId: string) => void;
  onPrioritize: (orderId: string) => void;
};

const productDetails: Record<ProductId, { label: string; route: string; icon: string }> = {
  standard: { label: "普通螺栓", route: "钢棒源 → 切割 → 车削 → 出口", icon: "◆" },
  precision: { label: "精密螺栓", route: "钢棒源 → 切割 → 车削 → 钻孔 → 出口", icon: "◎" },
  rustproof: { label: "防锈螺栓", route: "钢棒源 → 切割 → 车削 → 镀层 → 出口", icon: "◌" },
  hardened: { label: "强化螺栓", route: "钢棒源 → 切割 → 车削 → 热处理 → 出口", icon: "♨" },
};

function remainingSeconds(order: ProductionOrder, elapsed: number) {
  return Math.max(0, order.deadlineAt - elapsed);
}

function OrderSummary({
  order,
  elapsed,
  className = "",
  testId,
  feedback,
  children,
}: {
  order: ProductionOrder;
  elapsed: number;
  className?: string;
  testId?: string;
  feedback?: SchedulingOrderFeedback;
  children?: React.ReactNode;
}) {
  const product = productDetails[order.productId];
  const remaining = remainingSeconds(order, elapsed);
  const urgent = remaining > 0 && remaining < 6;
  const overdue = order.status === "overdue" || remaining <= 0;
  const forecast = feedback?.forecast;
  const forecastClass = forecast?.status ? ` order-card--forecast-${forecast.status}` : "";

  const forecastMessage = forecast?.status === "late"
    ? `预计超时 ${Math.abs(forecast.slack ?? 0).toFixed(1)}s`
    : forecast?.status === "inProduction"
      ? "生产中"
      : forecast?.status === "blocked"
        ? "预测受阻：检查下游或队列"
      : forecast?.status === "scheduled"
        ? "等待到达"
        : forecast?.expectedAt !== undefined
          ? `${order.status === "waiting" ? "加入队首后预计" : "预计"} ${forecast.expectedAt.toFixed(1)}s · 余量 ${(forecast.slack ?? 0).toFixed(1)}s`
          : null;

  return (
    <article data-testid={testId} className={`order-card order-card--${order.productId} ${urgent ? "order-card--urgent" : ""} ${overdue ? "order-card--overdue" : ""}${forecastClass} ${className}`}>
      <div className="order-card__heading">
        <span aria-hidden="true">{product.icon}</span>
        <div><small>订单号</small><strong>{order.id}</strong></div>
        <b>{product.label}</b>
      </div>
      <p className="order-card__route"><span aria-hidden="true">⚙</span>{product.route}</p>
      <div className="order-card__deadline">
        <span>截止 {order.deadlineAt.toFixed(1)}s</span>
        <strong>{overdue ? "已逾期" : `剩余 ${remaining.toFixed(1)}s`}</strong>
      </div>
      {urgent && <p className="order-card__urgent"><span aria-hidden="true">⚠</span>紧急：剩余不足 6 秒</p>}
      {feedback?.route.status === "missing" && <p className="order-card__route-alert">路线缺失：{feedback.route.missingLink}</p>}
      {forecastMessage && <p className="order-card__forecast">{forecastMessage}</p>}
      {children}
    </article>
  );
}

export function OrderPanel({
  orders,
  queue,
  elapsed,
  failure,
  feedback,
  actionsEnabled,
  onEnqueue,
  onMoveUp,
  onMoveDown,
  onPrioritize,
}: Props) {
  const byId = new Map(orders.map((order) => [order.id, order]));
  const feedbackById = new Map(feedback?.orders.map((entry) => [entry.id, entry]));
  const riskRank = (order: ProductionOrder) => {
    const status = feedbackById.get(order.id)?.forecast?.status;
    const ranks = { late: 0, danger: 1, blocked: 2, attention: 3, safe: 4, inProduction: 5, scheduled: 6 } as const;
    return ranks[status ?? "safe"];
  };
  const waiting = orders
    .filter((order) => order.status === "waiting")
    .sort((left, right) => riskRank(left) - riskRank(right));
  const queued = queue.map((orderId) => byId.get(orderId)).filter((order): order is ProductionOrder => Boolean(order));
  const current = orders.filter((order) => order.status === "inProduction");
  const completed = orders.filter((order) => order.status === "completed");
  const scheduled = orders
    .filter((order) => order.status === "scheduled")
    .sort((left, right) => left.arrivesAt - right.arrivesAt);
  const scheduledCount = scheduled.length;

  return (
    <section className="order-panel" aria-label="订单调度面板">
      <div className="panel-heading order-panel__heading">
        <span>订单看板</span><small>{scheduledCount > 0 ? `${scheduledCount} 单尚未到达` : "全部订单已到达"}</small>
      </div>
      {!actionsEnabled && (
        <p className="order-panel__locked" role="note">先启动生产再调整订单；设计或暂停时队列暂不可操作。</p>
      )}
      {failure && (
        <div className="order-failure" data-testid="order-failure" role="alert">
          <span aria-hidden="true">⚠</span>
          <p><b>订单 {failure.orderId} 已逾期</b><small>超时 {failure.overdueSeconds.toFixed(1)} 秒，本轮排程失败。</small></p>
        </div>
      )}
      {feedback && (
        <section className="scheduling-radar" data-testid="scheduling-radar" aria-labelledby="scheduling-radar-title">
          <h2 id="scheduling-radar-title">调度雷达</h2>
          <p>{feedback.recommendation.message}</p>
          {feedback.recommendation.kind === "enqueue" && feedback.recommendation.orderId && (
            <button
              type="button"
              data-testid={`prioritize-order-${feedback.recommendation.orderId}`}
              disabled={!actionsEnabled}
              onClick={() => onPrioritize(feedback.recommendation.orderId!)}
            >加入队首</button>
          )}
          {feedback.recommendation.kind === "moveToFront" && feedback.recommendation.orderId && (
            <button
              type="button"
              data-testid={`prioritize-order-${feedback.recommendation.orderId}`}
              disabled={!actionsEnabled}
              onClick={() => onPrioritize(feedback.recommendation.orderId!)}
            >提到队首</button>
          )}
        </section>
      )}

      <section className="order-section" aria-labelledby="order-scheduled-title">
        <h2 id="order-scheduled-title">即将到达 <span>{scheduled.length}</span></h2>
        <div className="order-stack">
          {scheduled.length === 0 && <p className="order-empty">没有待到达订单</p>}
          {scheduled.map((order) => (
            <OrderSummary key={order.id} order={order} elapsed={elapsed} feedback={feedbackById.get(order.id)} testId={`order-scheduled-${order.id}`} className="order-card--scheduled" />
          ))}
        </div>
      </section>

      <section className="order-section" aria-labelledby="order-waiting-title">
        <h2 id="order-waiting-title">待排订单 <span>{waiting.length}</span></h2>
        <div className="order-stack">
          {waiting.length === 0 && <p className="order-empty">等待新订单到达</p>}
          {waiting.map((order) => (
            <OrderSummary key={order.id} order={order} elapsed={elapsed} feedback={feedbackById.get(order.id)} testId={`order-waiting-${order.id}`} className="order-card--waiting">
              <button
                type="button"
                data-testid={`enqueue-order-${order.id}`}
                aria-label={`将订单 ${order.id} 加入生产队列`}
                disabled={!actionsEnabled}
                onClick={() => onEnqueue(order.id)}
              >
                加入队列 →
              </button>
            </OrderSummary>
          ))}
        </div>
      </section>

      <section className="order-section" aria-labelledby="order-queue-title">
        <h2 id="order-queue-title">生产队列 <span>{queued.length}</span></h2>
        <ol className="order-stack order-queue">
          {queued.length === 0 && <li className="order-empty">队列为空，钢棒源正在摸鱼</li>}
          {queued.map((order, index) => (
            <li key={order.id} data-testid={`order-queue-${order.id}`}>
              <OrderSummary order={order} elapsed={elapsed} feedback={feedbackById.get(order.id)} className="order-card--queued">
                <div className="order-card__queue-controls">
                  <span className="order-card__position">#{index + 1}</span>
                  <button
                    type="button"
                    data-testid={`queue-up-${order.id}`}
                    aria-label={`上移订单 ${order.id}`}
                    disabled={!actionsEnabled || index === 0}
                    onClick={() => onMoveUp(order.id)}
                  >↑</button>
                  <button
                    type="button"
                    data-testid={`queue-down-${order.id}`}
                    aria-label={`下移订单 ${order.id}`}
                    disabled={!actionsEnabled || index === queued.length - 1}
                    onClick={() => onMoveDown(order.id)}
                  >↓</button>
                </div>
              </OrderSummary>
            </li>
          ))}
        </ol>
      </section>

      <section className="order-section" data-testid="order-current" aria-labelledby="order-current-title">
        <h2 id="order-current-title">当前投料 <span>{current.length}</span></h2>
        <div className="order-stack">
          {current.length === 0 && <p className="order-empty">尚无订单进入产线</p>}
          {current.map((order) => <OrderSummary key={order.id} order={order} elapsed={elapsed} feedback={feedbackById.get(order.id)} className="order-card--current" />)}
        </div>
      </section>

      <section className="order-section order-section--completed" aria-labelledby="order-completed-title">
        <h2 id="order-completed-title">已完成 <span data-testid="order-completed-count">{completed.length}/{orders.length}</span></h2>
        <p>{completed.length === 0 ? "验收台还空着。" : completed.map((order) => order.id).join(" · ")}</p>
      </section>
    </section>
  );
}
