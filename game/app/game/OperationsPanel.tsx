import type { ReactNode } from "react";
import type { FactoryDesign, LevelConfig, ProductionState } from "./factory-model.mjs";
import { MaintenancePanel } from "./MaintenancePanel";

type Props = {
  design: FactoryDesign;
  state: ProductionState;
  level: LevelConfig;
  actionsEnabled: boolean;
  onCancel: (machineId: string) => boolean;
  onMoveUp: (machineId: string) => boolean;
  onMoveDown: (machineId: string) => boolean;
  children?: ReactNode;
};

export function OperationsPanel({ children, ...maintenanceProps }: Props) {
  return (
    <aside className="operations-panel" aria-label="生产维护与订单">
      <MaintenancePanel {...maintenanceProps} />
      {children}
    </aside>
  );
}
