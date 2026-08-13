"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import {
  DEVICE_TYPES,
  LEVEL_CONFIG,
  addDevice,
  advanceProduction,
  connectDevices,
  createEmptyDesign,
  createProductionState,
  moveDevice,
  pauseProduction,
  removeConnection,
  startProduction,
} from "./factory-model.mjs";
import type { DeviceType, FactoryDesign, ProductionState } from "./factory-model.mjs";
import { FactoryFloor } from "./FactoryFloor";
import "./game.css";

const palette: Array<{ type: DeviceType; icon: string; eyebrow: string; detail: string }> = [
  { type: "source", icon: "▰", eyebrow: "RAW 01 · 钢棒源", detail: "每 3 秒生成长钢棒" },
  { type: "cutter", icon: "✂", eyebrow: "CUT 02 · 切割机", detail: "2 秒 · 钢棒变短料" },
  { type: "lathe", icon: "⚙", eyebrow: "TURN 03 · 车削机", detail: "3 秒 · 短料变螺栓" },
  { type: "exit", icon: "✓", eyebrow: "QC 04 · 成品出口", detail: "即时接收合格螺栓" },
];

const starterDesign = () => createEmptyDesign();

export function MiniFactoryGame() {
  const [design, setDesign] = useState<FactoryDesign>(starterDesign);
  const [state, setState] = useState<ProductionState>(() => createProductionState(starterDesign()));
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [editedWhilePaused, setEditedWhilePaused] = useState(false);
  const [toast, setToast] = useState("把四台设备拖进画布，按工序顺序连起来。");
  const floorRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const previousTime = useRef<number | null>(null);
  const designRef = useRef(design);

  const locked = state.mode === "running";
  const remaining = Math.max(0, LEVEL_CONFIG.duration - state.elapsed);
  const completion = (state.completed / LEVEL_CONFIG.target) * 100;

  const markEdited = useCallback(() => {
    if (state.mode === "paused") setEditedWhilePaused(true);
  }, [state.mode]);

  const mutateDesign = useCallback((mutation: (current: FactoryDesign) => FactoryDesign) => {
    setDesign((current) => {
      const next = mutation(current);
      if (next !== current && state.mode !== "paused") {
        setState(createProductionState(next));
      }
      return next;
    });
    markEdited();
  }, [markEdited, state.mode]);

  useEffect(() => {
    designRef.current = design;
  }, [design]);

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConnectingFrom(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);

  useEffect(() => {
    if (state.mode !== "running") {
      previousTime.current = null;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }
    const loop = (time: number) => {
      const previous = previousTime.current ?? time;
      previousTime.current = time;
      const delta = Math.min(0.1, (time - previous) / 1000);
      setState((current) => advanceProduction(current, designRef.current, delta));
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [state.mode]);

  const beginPaletteDrag = (event: DragEvent<HTMLElement>, type: DeviceType) => {
    event.dataTransfer.setData("application/x-factory-palette", type);
    event.dataTransfer.effectAllowed = "copy";
  };

  const beginMove = (event: DragEvent<HTMLElement>, id: string) => {
    event.dataTransfer.setData("application/x-factory-device", id);
    event.dataTransfer.effectAllowed = "move";
  };

  const dropOnFloor = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (locked || !floorRef.current) return;
    const bounds = floorRef.current.getBoundingClientRect();
    const x = Math.max(10, Math.min(bounds.width - 188, event.clientX - bounds.left - 89));
    const y = Math.max(54, Math.min(bounds.height - 166, event.clientY - bounds.top - 77));
    const type = event.dataTransfer.getData("application/x-factory-palette") as DeviceType;
    const id = event.dataTransfer.getData("application/x-factory-device");
    if (type && DEVICE_TYPES[type]) {
      if (Object.values(design.devices).some((device) => device.type === type)) {
        setToast("V0.1 每类设备只提供一台。先把这条单线跑顺。 ");
        return;
      }
      mutateDesign((current) => addDevice(current, type, x, y));
      setToast(`${DEVICE_TYPES[type].label}已放置。`);
    } else if (id) {
      mutateDesign((current) => moveDevice(current, id, x, y));
    }
  };

  const finishConnection = (to: string) => {
    if (!connectingFrom || locked) return;
    const before = design;
    const next = connectDevices(before, connectingFrom, to);
    setConnectingFrom(null);
    if (next === before) {
      setToast("端口已经占用，或这个连接方向不成立。机器也有底线。 ");
      return;
    }
    mutateDesign(() => next);
    setToast("连线完成。运行前再检查一下工序顺序。 ");
  };

  const handleStart = () => {
    if (Object.keys(design.devices).length === 0) {
      setToast("画布还是空的。机器不会靠意念开工。 ");
      return;
    }
    setConnectingFrom(null);
    setState((current) => startProduction(current, { edited: editedWhilePaused, design }));
    setEditedWhilePaused(false);
    setToast(editedWhilePaused ? "设计已更新，本轮生产从零开始。" : "产线启动，布局已锁定。");
  };

  const handlePause = () => {
    setState((current) => pauseProduction(current));
    setToast("生产已暂停。现在可以调整设备和连线。 ");
  };

  const resetAttempt = (keepDesign: boolean) => {
    const nextDesign = keepDesign ? design : createEmptyDesign();
    setDesign(nextDesign);
    setState(createProductionState(nextDesign));
    setConnectingFrom(null);
    setEditedWhilePaused(false);
    setToast(keepDesign ? "生产状态已清空，设备和连线为你保留。" : "画布已清空，重新设计吧。 ");
  };

  const averageOutput = useMemo(
    () => state.elapsed > 0 ? ((state.completed / state.elapsed) * 60).toFixed(1) : "0.0",
    [state.completed, state.elapsed],
  );

  const allMachinesPlaced = Object.keys(design.devices).length === palette.length;

  return (
    <main className="factory-app">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">M<span>F</span></span>
          <div><b>迷你自动化工厂</b><small>MINI AUTOMATION FACTORY · V0.1</small></div>
        </div>
        <div className="level-title">
          <span>教学关卡 01</span>
          <h1>第 1 关：螺栓生产</h1>
        </div>
        <div className="header-status">
          <span className={`status-light status-light--${state.mode}`} />
          <div><small>系统状态</small><b>{state.mode === "running" ? "生产中" : state.mode === "paused" ? "已暂停" : "设计模式"}</b></div>
        </div>
      </header>

      <section className="mission-strip" aria-label="关卡目标">
        <div><span className="mission-tag">MISSION</span><p>60 秒内生产 <b>10</b> 个合格螺栓</p></div>
        <div className="route-hint"><span>钢棒</span><i>→</i><span>切割</span><i>→</i><span>车削</span><i>→</i><span>出口</span></div>
        <div className="mission-metrics">
          <div><small>剩余时间</small><strong className={remaining <= 10 ? "urgent" : ""}>{remaining.toFixed(1)}<em>s</em></strong></div>
          <div><small>合格产出</small><strong>{state.completed}<em>/10</em></strong></div>
        </div>
      </section>

      <div className="workspace">
        <aside className="equipment-panel">
          <div className="panel-heading"><span>设备库</span><small>拖入画布</small></div>
          <div className="equipment-list">
            {palette.map((item) => {
              const placed = Object.values(design.devices).some((device) => device.type === item.type);
              return (
                <article
                  key={item.type}
                  className={`palette-card ${placed ? "palette-card--placed" : ""}`}
                  draggable={!locked && !placed}
                  onDragStart={(event) => beginPaletteDrag(event, item.type)}
                >
                  <span className="palette-card__icon">{item.icon}</span>
                  <div><small>{item.eyebrow}</small><b>{DEVICE_TYPES[item.type].label}</b><p>{item.detail}</p></div>
                  <span className="palette-card__state">{placed ? "已放置" : "拖拽"}</span>
                </article>
              );
            })}
          </div>
          <div className="capacity-note"><b>容量规则</b><p>每台机器：1 个加工位 + 1 个等待位</p><p>每条连线：同时运输 1 件物料</p></div>
        </aside>

        <section className="floor-section">
          <FactoryFloor
            design={design}
            state={state}
            locked={locked}
            connectingFrom={connectingFrom}
            floorRef={floorRef}
            onDrop={dropOnFloor}
            onMoveStart={beginMove}
            onStartConnection={setConnectingFrom}
            onConnect={finishConnection}
            onRemoveConnection={(id) => mutateDesign((current) => removeConnection(current, id))}
          />
          <div className={`feedback-bar ${state.warning ? "feedback-bar--warning" : ""}`} role="status" aria-live="polite">
            <span>{state.warning ? "!" : state.mode === "running" ? "▶" : "i"}</span>
            <p>{state.warning ?? toast}</p>
            <small>{locked ? "布局锁定" : allMachinesPlaced ? "设备齐全" : `还需放置 ${palette.length - Object.keys(design.devices).length} 台设备`}</small>
          </div>
        </section>
      </div>

      <footer className="control-deck">
        <div className="progress-cluster"><span>任务进度</span><div className="task-progress"><i style={{ width: `${completion}%` }} /></div><b>{Math.round(completion)}%</b></div>
        <div className="control-buttons">
          {state.mode !== "running" ? (
            <button className="primary-control" onClick={handleStart}>
              <span>▶</span>{state.mode === "paused" && !editedWhilePaused ? "继续生产" : "开始生产"}
            </button>
          ) : (
            <button className="pause-control" onClick={handlePause}><span>Ⅱ</span>暂停生产</button>
          )}
          <button className="ghost-control" onClick={() => resetAttempt(true)} disabled={state.mode === "running"}>↻ 重置本轮</button>
          <button className="ghost-control" onClick={() => resetAttempt(false)} disabled={state.mode === "running"}>× 清空画布</button>
        </div>
        <div className="legend"><span><i className="legend-working" />加工中</span><span><i className="legend-wait" />等待</span><span><i className="legend-error" />错误</span></div>
      </footer>

      {(state.mode === "success" || state.mode === "failure") && (
        <div className="settlement-backdrop" role="dialog" aria-modal="true" aria-labelledby="settlement-title">
          <section className={`settlement-card settlement-card--${state.mode}`}>
            <span className="settlement-kicker">PRODUCTION REPORT</span>
            <div className="settlement-icon">{state.mode === "success" ? "✓" : "!"}</div>
            <h2 id="settlement-title">{state.mode === "success" ? "生产任务完成！" : "生产任务未完成"}</h2>
            <p>{state.mode === "success" ? "螺栓产线稳定运行，第一班顺利交付。" : "检查机器的连接顺序，确保物料经过完整加工流程。"}</p>
            <div className="settlement-stats">
              <div><small>合格螺栓</small><strong>{state.completed} / 10</strong></div>
              <div><small>完成时间</small><strong>{state.elapsed.toFixed(1)} 秒</strong></div>
              <div><small>平均产量</small><strong>{averageOutput} 件/分钟</strong></div>
            </div>
            <div className="settlement-actions">
              <button onClick={() => resetAttempt(true)}>{state.mode === "success" ? "重新挑战" : "重新设计"}</button>
              <button disabled>下一关（V0.1 未开放）</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
