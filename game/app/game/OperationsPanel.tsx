import type { ReactNode } from "react";
import type { FactoryDesign, LevelConfig, ProductionState } from "./factory-model.mjs";
import type { OperationsFeedback } from "./operations-feedback.mjs";
import { MaintenancePanel } from "./MaintenancePanel";

type Props = {
  design: FactoryDesign;
  state: ProductionState;
  level: LevelConfig;
  actionsEnabled: boolean;
  onCancel: (machineId: string) => boolean;
  onMoveUp: (machineId: string) => boolean;
  onMoveDown: (machineId: string) => boolean;
  feedback: OperationsFeedback | null;
  orderActionsEnabled: boolean;
  maintenanceActionsEnabled: boolean;
  onEnqueueOrder: (orderId: string) => boolean;
  onPrioritizeOrder: (orderId: string) => boolean;
  onScheduleMaintenance: (machineId: string) => boolean;
  onPrioritizeMaintenance: (machineId: string) => boolean;
  children?: ReactNode;
};

export function OperationsPanel({
  children,
  design,
  state,
  level,
  actionsEnabled,
  onCancel,
  onMoveUp,
  onMoveDown,
  feedback,
  orderActionsEnabled,
  maintenanceActionsEnabled,
  onEnqueueOrder,
  onPrioritizeOrder,
  onScheduleMaintenance,
  onPrioritizeMaintenance,
}: Props) {
  const recommendation = feedback?.recommendation;
  return (
    <aside className="operations-panel" aria-label="生产维护与订单">
      <MaintenancePanel
        design={design}
        state={state}
        level={level}
        actionsEnabled={actionsEnabled}
        onCancel={onCancel}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
      />
      {recommendation && (
        <section className="scheduling-radar operations-radar" data-testid="operations-radar" aria-labelledby="operations-radar-title">
          <h2 id="operations-radar-title">运营雷达</h2>
          <p>{recommendation.message}</p>
          {recommendation.kind === "enqueue" && (
            <button
              type="button"
              data-testid={`operations-enqueue-${recommendation.orderId}`}
              disabled={!orderActionsEnabled}
              onClick={() => onEnqueueOrder(recommendation.orderId)}
            >加入生产队列</button>
          )}
          {recommendation.kind === "moveToFront" && (
            <button
              type="button"
              data-testid={`operations-prioritize-order-${recommendation.orderId}`}
              disabled={!orderActionsEnabled}
              onClick={() => onPrioritizeOrder(recommendation.orderId)}
            >提到队首</button>
          )}
          {recommendation.kind === "scheduleMaintenance" && (
            <button
              type="button"
              data-testid={`operations-maintain-${recommendation.machineId}`}
              disabled={!maintenanceActionsEnabled}
              onClick={() => onScheduleMaintenance(recommendation.machineId)}
            >安排维护</button>
          )}
          {recommendation.kind === "prioritizeRepair" && (
            <button
              type="button"
              data-testid={`operations-prioritize-repair-${recommendation.machineId}`}
              disabled={!maintenanceActionsEnabled}
              onClick={() => onPrioritizeMaintenance(recommendation.machineId)}
            >抢修提到队首</button>
          )}
        </section>
      )}
      {children}
    </aside>
  );
}
