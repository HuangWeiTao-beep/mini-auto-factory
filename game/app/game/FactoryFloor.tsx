import type { DragEvent, RefObject } from "react";
import { MATERIALS, getTransportDuration } from "./factory-model.mjs";
import type { FactoryDesign, GridCell, LevelConfig, ProductionState } from "./factory-model.mjs";
import { GRID } from "./factory-grid.mjs";
import { MachineCard } from "./MachineCard";

type Props = {
  design: FactoryDesign;
  state: ProductionState;
  level: LevelConfig;
  locked: boolean;
  connectingFrom: string | null;
  floorRef: RefObject<HTMLDivElement | null>;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onMoveStart: (event: DragEvent<HTMLElement>, id: string) => void;
  onStartConnection: (id: string) => void;
  onConnect: (to: string) => void;
  onRemoveConnection: (id: string) => void;
};

const size = { width: 178, height: 154 };

function curve(fromX: number, fromY: number, toX: number, toY: number) {
  const bend = Math.max(54, Math.abs(toX - fromX) * 0.45);
  return `M ${fromX} ${fromY} C ${fromX + bend} ${fromY}, ${toX - bend} ${toY}, ${toX} ${toY}`;
}

function gridStyle(cell: GridCell) {
  return {
    left: cell.gridX * GRID.cellSize,
    top: cell.gridY * GRID.cellSize,
  };
}

export function FactoryFloor({
  design,
  state,
  level,
  locked,
  connectingFrom,
  floorRef,
  onDrop,
  onMoveStart,
  onStartConnection,
  onConnect,
  onRemoveConnection,
}: Props) {
  const deviceCapacity = Object.values(level.deviceLimits).reduce((sum, limit) => sum + limit, 0);

  return (
    <div
      ref={floorRef}
      className={`factory-floor ${locked ? "factory-floor--locked" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="floor-grid" aria-hidden="true" />
      {level.obstacles.map((cell) => (
        <div
          key={`${cell.gridX}-${cell.gridY}`}
          className="floor-obstacle"
          style={gridStyle(cell)}
          title={`障碍工位（${cell.gridX}, ${cell.gridY}）`}
        >
          <span>障碍</span>
        </div>
      ))}
      <div className="floor-label"><span>ASSEMBLY FLOOR {String(level.id).padStart(2, "0")}</span><b>设备 {Object.keys(design.devices).length}/{deviceCapacity}</b></div>
      {Object.keys(design.devices).length === 0 && (
        <div className="floor-empty">
          <span>＋</span>
          <strong>把设备拖到这里</strong>
          <small>先摆设备，再从橙色输出端口连到蓝色输入端口</small>
        </div>
      )}

      <svg className="connection-layer" aria-hidden="true">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        {design.connections.map((connection) => {
          const from = design.devices[connection.from];
          const to = design.devices[connection.to];
          const line = state.lines[connection.id];
          if (!from || !to) return null;
          const x1 = from.gridX * GRID.cellSize + size.width;
          const y1 = from.gridY * GRID.cellSize + 80;
          const x2 = to.gridX * GRID.cellSize;
          const y2 = to.gridY * GRID.cellSize + 80;
          const d = curve(x1, y1, x2, y2);
          const labelX = (x1 + x2) / 2;
          const labelY = (y1 + y2) / 2;
          const transportDuration = line?.item?.transportDuration
            ?? getTransportDuration(level, from, to);
          const showsBranchLabel = level.id === 3 || level.id === 5;
          return (
            <g key={connection.id}>
              <path className="connection-hit" d={d} onClick={() => !locked && onRemoveConnection(connection.id)} />
              <path className="connection" d={d} markerEnd="url(#arrow)" />
              {showsBranchLabel && connection.branchIndex != null && (
                <g className="connection-branch-label" transform={`translate(${labelX} ${labelY - 13})`}>
                  <circle r="11" />
                  <text className="connection-branch" textAnchor="middle" dominantBaseline="central">
                    {String.fromCharCode(65 + connection.branchIndex)}
                  </text>
                </g>
              )}
              {level.transportMode === "distance" && (
                <g className="connection-duration-label" transform={`translate(${labelX} ${labelY + 15})`}>
                  <rect x="-23" y="-9" width="46" height="18" rx="3" />
                  <text className="connection-duration" textAnchor="middle" dominantBaseline="central">
                    {transportDuration.toFixed(1)}s
                  </text>
                </g>
              )}
              {line?.item && (
                <circle className={`material-dot material-dot--${line.item.kind} material-dot--${line.item.status}`} r="11">
                  <animateMotion dur={`${line.item.transportDuration}s`} fill="freeze" keyPoints={`${line.item.progress};1`} keyTimes="0;1" calcMode="linear" path={d} />
                  <title>{MATERIALS[line.item.kind].label}</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {Object.values(design.devices).map((device) => (
        <MachineCard
          key={device.id}
          device={device}
          state={state}
          level={level}
          locked={locked}
          isConnecting={Boolean(connectingFrom)}
          onStartConnection={onStartConnection}
          onFinishConnection={onConnect}
          onDragStart={onMoveStart}
        />
      ))}

      {connectingFrom && !locked && (
        <div className="connection-tip">选择一个蓝色输入端口完成连线 · ESC 取消</div>
      )}
    </div>
  );
}
