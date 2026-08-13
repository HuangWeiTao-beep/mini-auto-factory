import type { DragEvent, MouseEvent } from "react";
import { DEVICE_TYPES, MATERIALS } from "./factory-model.mjs";
import type { Device, LevelConfig, MaterialType, ProductionState } from "./factory-model.mjs";

type Props = {
  device: Device;
  state: ProductionState;
  level: LevelConfig;
  locked: boolean;
  isConnecting: boolean;
  onStartConnection: (id: string) => void;
  onFinishConnection: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
};

const icons = { source: "▰", cutter: "✂", lathe: "⚙", drill: "◉", exit: "✓" } as const;
const statusLabels: Record<string, string> = {
  idle: "待机",
  working: "加工中",
  ready: "出料就绪",
  waiting: "等待中",
  blocked: "已阻塞",
  warning: "工序警告",
};

function materialLabel(kind: MaterialType | null | undefined) {
  return kind ? MATERIALS[kind].shortLabel : "空";
}

function machineDescription(device: Device, level: LevelConfig) {
  if (device.type === "source") return `${level.sourceInterval.toFixed(1)} 秒 / 根`;
  if (device.type === "cutter") return `长钢棒 → 短料 · ${level.machineDurations.cutter.toFixed(1)} 秒`;
  if (device.type === "lathe") {
    const output = level.id === 1 ? "螺栓" : "未钻孔螺栓";
    return `短料 → ${output} · ${level.machineDurations.lathe.toFixed(1)} 秒`;
  }
  if (device.type === "drill") return `未钻孔螺栓 → 螺栓 · ${level.machineDurations.drill.toFixed(1)} 秒`;
  return "合格品计数";
}

export function MachineCard({
  device,
  state,
  level,
  locked,
  isConnecting,
  onStartConnection,
  onFinishConnection,
  onDragStart,
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
  const processingDuration = device.type === "cutter" || device.type === "lathe" || device.type === "drill"
    ? level.machineDurations[device.type]
    : spec.duration;
  const progress = machine?.active
    ? Math.max(0, 1 - machine.remaining / processingDuration)
    : 0;

  const finishConnection = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isConnecting && !locked) onFinishConnection(device.id);
  };

  return (
    <article
      className={`machine machine--${device.type} machine--${visualStatus}`}
      style={{ left: device.x, top: device.y }}
      draggable={!locked}
      onDragStart={(event) => onDragStart(event, device.id)}
      aria-label={`${spec.label}，${statusLabels[visualStatus] ?? "待机"}`}
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
