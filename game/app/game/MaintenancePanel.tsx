import { DEVICE_TYPES } from "./factory-model.mjs";
import type { FactoryDesign, LevelConfig, ProductionState } from "./factory-model.mjs";

type Props = {
  design: FactoryDesign;
  state: ProductionState;
  level: LevelConfig;
  actionsEnabled: boolean;
  onCancel: (machineId: string) => boolean;
  onMoveUp: (machineId: string) => boolean;
  onMoveDown: (machineId: string) => boolean;
};

type Job = NonNullable<ProductionState["maintenance"]>["queue"][number];

function machineLabel(design: FactoryDesign, machineId: string) {
  const device = design.devices[machineId];
  return device ? DEVICE_TYPES[device.type].label : machineId;
}

function jobKindLabel(job: Job) {
  return job.kind === "repair" ? "故障抢修" : "计划维护";
}

export function MaintenancePanel({
  design,
  state,
  level,
  actionsEnabled,
  onCancel,
  onMoveUp,
  onMoveDown,
}: Props) {
  const activeJob = state.maintenance?.activeJob ?? null;
  const queue = state.maintenance?.queue ?? [];
  const hasOrderPanel = Boolean(level.orderConfig);
  const objective = level.maintenance?.objective;
  const plannedCompleted = state.maintenance?.plannedCompleted ?? 0;
  const queueReorders = state.maintenance?.queueReorders ?? 0;

  return (
    <section className="maintenance-panel" aria-label="维修队列面板">
      <div className="panel-heading maintenance-panel__heading">
        <span>维修队列</span><small>单维修队 · {activeJob ? "作业中" : "待命"}</small>
      </div>

      {!hasOrderPanel && (
        <section className="maintenance-goal" data-testid="maintenance-production-goal" aria-label="完整生产目标">
          <strong>{level.duration} 秒内完成 {level.target} 件合格品</strong>
          <p>{level.routeHint}</p>
          <small>观察磨损，在故障前安排计划维护；队首机器忙碌时可调整等待顺序。</small>
        </section>
      )}

      {objective && (
        <section className="maintenance-goal" data-testid="maintenance-objective" aria-label="维护验收目标">
          <strong>维护验收</strong>
          <p>计划维护 {Math.min(plannedCompleted, objective.plannedCompletions)}/{objective.plannedCompletions}</p>
          {objective.queueReorders > 0 && (
            <small>队列调整 {Math.min(queueReorders, objective.queueReorders)}/{objective.queueReorders}</small>
          )}
        </section>
      )}

      <section className="maintenance-section" aria-labelledby="maintenance-active-title">
        <h2 id="maintenance-active-title">当前任务 <span>{activeJob ? 1 : 0}</span></h2>
        {activeJob ? (
          <article
            className={`maintenance-job maintenance-job--active maintenance-job--${activeJob.kind}`}
            data-testid={`maintenance-active-${activeJob.machineId}`}
          >
            <div><strong>{machineLabel(design, activeJob.machineId)}</strong><small>{jobKindLabel(activeJob)}</small></div>
            <b>{activeJob.remaining.toFixed(1)}s</b>
            <p>维修中，设备停止接料</p>
          </article>
        ) : (
          <p className="maintenance-empty">维修队当前待命</p>
        )}
      </section>

      <section className="maintenance-section" aria-labelledby="maintenance-queue-title">
        <h2 id="maintenance-queue-title">等待任务 <span>{queue.length}</span></h2>
        <ol className="maintenance-stack">
          {queue.length === 0 && <li className="maintenance-empty">队列为空</li>}
          {queue.map((job, index) => {
            const label = machineLabel(design, job.machineId);
            return (
              <li
                key={job.machineId}
                className={`maintenance-job maintenance-job--${job.kind}`}
                data-testid={`maintenance-queue-${job.machineId}`}
              >
                <span className="maintenance-job__position">#{index + 1}</span>
                <div><strong>{label}</strong><small>{jobKindLabel(job)} · {job.remaining.toFixed(1)}s</small></div>
                <div className="maintenance-job__controls">
                  <button
                    type="button"
                    data-testid={`maintenance-up-${job.machineId}`}
                    aria-label={`上移 ${label}`}
                    disabled={!actionsEnabled || index === 0}
                    onClick={() => onMoveUp(job.machineId)}
                  >↑</button>
                  <button
                    type="button"
                    data-testid={`maintenance-down-${job.machineId}`}
                    aria-label={`下移 ${label}`}
                    disabled={!actionsEnabled || index === queue.length - 1}
                    onClick={() => onMoveDown(job.machineId)}
                  >↓</button>
                  {job.kind === "planned" && (
                    <button
                      type="button"
                      data-testid={`maintenance-cancel-${job.machineId}`}
                      aria-label={`取消 ${label} 维护`}
                      disabled={!actionsEnabled}
                      onClick={() => onCancel(job.machineId)}
                    >取消</button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}
