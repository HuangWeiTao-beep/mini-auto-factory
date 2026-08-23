import type { DragEvent, MouseEvent, SyntheticEvent } from "react";
import { DEVICE_TYPES, MATERIALS } from "./factory-model.mjs";
import type { Device, DeviceType, LevelConfig, MaterialType, OrderMaterial, ProductionState } from "./factory-model.mjs";
import { GRID } from "./factory-grid.mjs";
import { getReliabilityView } from "./maintenance-model.mjs";

type Props = {
  device: Device;
  state: ProductionState;
  level: LevelConfig;
  locked: boolean;
  isConnecting: boolean;
  onStartConnection: (id: string) => void;
  onFinishConnection: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
  maintenanceActionsEnabled: boolean;
  onRequestMaintenance: (machineId: string) => boolean;
  onCancelMaintenance: (machineId: string) => boolean;
};

const icons: Record<DeviceType, string> = { source: "▰", cutter: "✂", lathe: "⚙", drill: "◉", coater: "◌", heatTreater: "♨", exit: "✓" };
const statusLabels: Record<string, string> = {
  idle: "待机",
  working: "加工中",
  ready: "出料就绪",
  waiting: "等待中",
  blocked: "已阻塞",
  warning: "工序警告",
};

function materialLabel(material: MaterialType | OrderMaterial | null | undefined) {
  if (!material) return "空";
  const kind = typeof material === "string" ? material : material.kind;
  return MATERIALS[kind].shortLabel;
}

function processingDuration(device: Device, level: LevelConfig) {
  if (device.type === "source" || device.type === "exit") return DEVICE_TYPES[device.type].duration;
  return level.machineDurations[device.type] ?? DEVICE_TYPES[device.type].duration;
}

function machineDescription(device: Device, level: LevelConfig) {
  if (device.type === "source") return `${level.sourceInterval.toFixed(1)} 秒 / 根`;
  const duration = processingDuration(device, level).toFixed(1);
  if (device.type === "cutter") return `长钢棒 → 短料 · ${duration} 秒`;
  if (device.type === "lathe") {
    const output = level.chapter === 1 && level.id > 1 ? "未钻孔螺栓" : "螺栓";
    return `短料 → ${output} · ${duration} 秒`;
  }
  if (device.type === "drill") return `未钻孔螺栓 → 螺栓 · ${duration} 秒`;
  if (device.type === "coater") return `螺栓 → 镀层成为防锈螺栓 · ${duration} 秒`;
  if (device.type === "heatTreater") return `螺栓 → 强化螺栓 · ${duration} 秒`;
  return "合格品计数";
}

const reliabilityLabels = {
  normal: "正常",
  warning: "预警",
  danger: "高危",
  failed: "故障",
  "maintenance-pending": "待维护",
  "under-maintenance": "维护中",
  broken: "故障",
} as const;

export function MachineCard({
  device,
  state,
  level,
  locked,
  isConnecting,
  onStartConnection,
  onFinishConnection,
  onDragStart,
  maintenanceActionsEnabled,
  onRequestMaintenance,
  onCancelMaintenance,
}: Props) {
  const spec = DEVICE_TYPES[device.type];
  const machine = state.machines[device.id];
  const isSource = device.type === "source";
  const source = isSource ? state.sources[device.id] : undefined;
  const status = machine?.status ?? ((source?.pulse ?? 0) > 0 ? "working" : "idle");
  const incomingBlocked = Object.values(state.lines).some(
    (line) => line.to === device.id && (line.item?.status === "waiting" || line.item?.status === "blocked"),
  );
  const visualStatus = status === "warning"
    ? "warning"
    : incomingBlocked || machine?.output
      ? "blocked"
      : source?.output || machine?.waiting
        ? "waiting"
        : status;
  const hasInput = device.type !== "source";
  const hasOutput = device.type !== "exit";
  const duration = processingDuration(device, level);
  const progress = machine?.active
    ? Math.max(0, 1 - machine.remaining / duration)
    : 0;
  const maintenanceViewLevel = level.maintenance
    ? {
        maintenance: {
          ...level.maintenance,
          wearPerCycle: { ...level.maintenance.wearPerCycle },
        },
      }
    : {};
  const reliability = machine?.reliability && level.maintenance
    ? getReliabilityView(machine, device.type, maintenanceViewLevel)
    : null;
  const reliabilityState = machine?.reliability?.status === "available"
    ? reliability?.band ?? "normal"
    : machine?.reliability?.status ?? "normal";
  const reliabilityLabel = reliabilityLabels[reliabilityState];
  const activeMaintenance = state.maintenance?.activeJob?.machineId === device.id
    ? state.maintenance.activeJob
    : null;
  const queuedPlannedMaintenance = state.maintenance?.queue.some(
    (job) => job.machineId === device.id && job.kind === "planned",
  ) ?? false;

  const stopMaintenanceButtonPropagation = (event: SyntheticEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  const finishConnection = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isConnecting && !locked) onFinishConnection(device.id);
  };

  return (
    <article
      className={`machine machine--${device.type} machine--${visualStatus} ${reliability ? `machine--reliability-${reliabilityState}` : ""}`}
      style={{
        left: device.gridX * GRID.cellSize,
        top: device.gridY * GRID.cellSize,
      }}
      draggable={!locked}
      onDragStart={(event) => onDragStart(event, device.id)}
      aria-label={`${spec.label}，${statusLabels[visualStatus] ?? "待机"}${reliability ? `，可靠性${reliabilityLabel}` : ""}`}
    >
      {hasInput && (
        <button
          className={`port port--input ${isConnecting ? "port--ready" : ""}`}
          onClick={finishConnection}
          disabled={locked}
          aria-label={`${spec.label}输入端口`}
          title="输入端口"
        />
      )}

      <div className="machine__topline">
        <span className="machine__index">{device.id.slice(-2).toUpperCase()}</span>
        <span className="machine__state">
          <em>{statusLabels[visualStatus] ?? "待机"}</em>
          <span className={`machine__lamp machine__lamp--${visualStatus}`} />
        </span>
      </div>
      <div className="machine__icon" aria-hidden="true">{icons[device.type]}</div>
      <div>
        <strong>{spec.label}</strong>
        <small>{machineDescription(device, level)}</small>
      </div>

      {machine && (
        <div className="machine__slots">
          <span>加工位 <b>{materialLabel(machine.active)}</b></span>
          <span>等待位 <b>{materialLabel(machine.waiting)}</b></span>
        </div>
      )}
      {machine?.active && (
        <div className="machine__progress" aria-label={`加工进度 ${Math.round(progress * 100)}%`}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}

      {reliability && machine?.reliability && (
        <div className="machine__wear">
          <div className="machine__wear-heading">
            <strong>{reliabilityLabel}</strong>
            <span>{Math.round(reliability.wear)}%</span>
            <small>约剩 {reliability.remainingCycles} 次</small>
          </div>
          <div className="machine__wear-track" aria-label={`磨损 ${Math.round(reliability.wear)}%`}>
            <i style={{ width: `${Math.min(100, reliability.wear)}%` }} />
          </div>
          {activeMaintenance && (
            <small className="machine__maintenance-time">剩余 {activeMaintenance.remaining.toFixed(1)}s · 停止接料</small>
          )}
          {machine.reliability.status === "available" && (
            <button
              type="button"
              data-testid={`maintenance-request-${device.id}`}
              disabled={!maintenanceActionsEnabled}
              onClick={(event) => {
                stopMaintenanceButtonPropagation(event);
                onRequestMaintenance(device.id);
              }}
              onDragStart={stopMaintenanceButtonPropagation}
            >安排维护</button>
          )}
          {machine.reliability.status === "maintenance-pending" && queuedPlannedMaintenance && (
            <button
              type="button"
              data-testid={`maintenance-card-cancel-${device.id}`}
              disabled={!maintenanceActionsEnabled}
              onClick={(event) => {
                stopMaintenanceButtonPropagation(event);
                onCancelMaintenance(device.id);
              }}
              onDragStart={stopMaintenanceButtonPropagation}
            >取消维护</button>
          )}
        </div>
      )}

      {hasOutput && (
        <button
          className="port port--output"
          onClick={(event) => {
            event.stopPropagation();
            if (!locked) onStartConnection(device.id);
          }}
          disabled={locked}
          aria-label={`${spec.label}输出端口`}
          title="输出端口"
        />
      )}
    </article>
  );
}
