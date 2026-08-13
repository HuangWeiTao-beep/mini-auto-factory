import type { DragEvent, MouseEvent } from "react";
import { DEVICE_TYPES, MATERIALS } from "./factory-model.mjs";
import type { Device, MaterialType, ProductionState } from "./factory-model.mjs";

type Props = {
  device: Device;
  state: ProductionState;
  locked: boolean;
  isConnecting: boolean;
  onStartConnection: (id: string) => void;
  onFinishConnection: (id: string) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: string) => void;
};

const icons = { source: "▰", cutter: "✂", lathe: "⚙", exit: "✓" } as const;

function materialLabel(kind: MaterialType | null | undefined) {
  return kind ? MATERIALS[kind].shortLabel : "空";
}

export function MachineCard({
  device,
  state,
  locked,
  isConnecting,
  onStartConnection,
  onFinishConnection,
  onDragStart,
}: Props) {
  const spec = DEVICE_TYPES[device.type];
  const machine = state.machines[device.id];
  const isSource = device.type === "source";
  const status = machine?.status ?? (isSource && state.source.pulse > 0 ? "working" : "idle");
  const hasInput = device.type !== "source";
  const hasOutput = device.type !== "exit";
  const progress = machine?.active
    ? Math.max(0, 1 - machine.remaining / spec.duration)
    : 0;

  const finishConnection = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (isConnecting && !locked) onFinishConnection(device.id);
  };

  return (
    <article
      className={`machine machine--${device.type} machine--${status}`}
      style={{ left: device.x, top: device.y }}
      draggable={!locked}
      onDragStart={(event) => onDragStart(event, device.id)}
      aria-label={`${spec.label}，${status === "working" ? "加工中" : status === "warning" ? "警告" : "待机"}`}
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
        <span className={`machine__lamp machine__lamp--${status}`} />
      </div>
      <div className="machine__icon" aria-hidden="true">{icons[device.type]}</div>
      <div>
        <strong>{spec.label}</strong>
        <small>
          {device.type === "source" && "3.0 秒 / 根"}
          {device.type === "cutter" && "长钢棒 → 短料 · 2.0 秒"}
          {device.type === "lathe" && "短料 → 螺栓 · 3.0 秒"}
          {device.type === "exit" && "合格品计数"}
        </small>
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
