export const createMachineReliability = () => ({ wear: 0, status: "available" });

export const createMaintenanceState = () => ({
  activeJob: null,
  queue: [],
  plannedCompleted: 0,
  queueReorders: 0,
});

export function getReliabilityView(machine, deviceType, level) {
  const config = level?.maintenance ?? {};
  const wear = machine?.reliability?.wear ?? 0;
  const slowdownThreshold = config.slowdownThreshold ?? 85;
  const failureThreshold = config.failureThreshold ?? 100;
  const rate = config.wearPerCycle?.[deviceType] ?? 0;
  const remainingCycles = rate > 0
    ? Math.max(0, Math.ceil((failureThreshold - wear) / rate))
    : 0;
  const band = wear >= failureThreshold ? "failed"
    : wear >= slowdownThreshold ? "danger"
    : wear >= 60 ? "warning" : "normal";
  return { band, wear, remainingCycles };
}

export function getProcessingDuration(machine, baseDuration, level) {
  const wear = machine?.reliability?.wear ?? 0;
  const threshold = level?.maintenance?.slowdownThreshold ?? 85;
  return wear >= threshold ? Math.round(baseDuration * 1.2 * 1000) / 1000 : baseDuration;
}

function cloneRuntimeState(state) {
  return {
    ...state,
    machines: Object.fromEntries(Object.entries(state.machines ?? {}).map(([id, machine]) => [id, {
      ...machine,
      reliability: machine.reliability ? { ...machine.reliability } : machine.reliability,
    }])),
    maintenance: {
      ...(state.maintenance ?? createMaintenanceState()),
      activeJob: state.maintenance?.activeJob ? { ...state.maintenance.activeJob } : null,
      queue: (state.maintenance?.queue ?? []).map((job) => ({ ...job })),
    },
  };
}

export function requestMaintenance(state, machineId, level) {
  const machine = state?.machines?.[machineId];
  const config = level?.maintenance;
  if (!machine || !config || machine.reliability?.status !== "available") return state;
  const maintenance = state.maintenance ?? createMaintenanceState();
  if (maintenance.activeJob?.machineId === machineId || maintenance.queue.some((job) => job.machineId === machineId)) return state;
  const next = cloneRuntimeState(state);
  next.machines[machineId].reliability = {
    ...(next.machines[machineId].reliability ?? createMachineReliability()),
    status: "maintenance-pending",
  };
  next.maintenance.queue.push({ machineId, kind: "planned", remaining: config.plannedDuration ?? 4 });
  return next;
}

export function cancelMaintenanceRequest(state, machineId) {
  const queue = state?.maintenance?.queue ?? [];
  const index = queue.findIndex((job) => job.machineId === machineId && job.kind === "planned");
  if (index < 0) return state;
  if ((state.machines?.[machineId]?.reliability?.wear ?? 0) >= 100) return state;
  const next = cloneRuntimeState(state);
  next.maintenance.queue.splice(index, 1);
  const machine = next.machines?.[machineId];
  if (machine?.reliability?.status === "maintenance-pending") machine.reliability.status = "available";
  return next;
}

export function moveMaintenanceRequest(state, machineId, nextIndex) {
  const queue = state?.maintenance?.queue ?? [];
  const index = queue.findIndex((job) => job.machineId === machineId);
  const target = Math.max(0, Math.min(Number.isFinite(nextIndex) ? Math.trunc(nextIndex) : 0, queue.length - 1));
  if (index < 0 || queue.length < 2 || target === index) return state;
  const next = cloneRuntimeState(state);
  const [job] = next.maintenance.queue.splice(index, 1);
  next.maintenance.queue.splice(target, 0, job);
  next.maintenance.queueReorders = (next.maintenance.queueReorders ?? 0) + 1;
  return next;
}

export function applyCompletedMachineCycle(state, machineId, deviceType, level) {
  const machine = state?.machines?.[machineId];
  const config = level?.maintenance;
  if (!machine || !config) return state;
  const reliability = machine.reliability ?? (machine.reliability = createMachineReliability());
  const rate = config.wearPerCycle?.[deviceType] ?? 0;
  reliability.wear = Math.min(config.failureThreshold ?? 100, reliability.wear + rate);
  const planned = state.maintenance?.activeJob?.machineId === machineId
    && state.maintenance.activeJob.kind === "planned"
    || state.maintenance?.queue?.some((job) => job.machineId === machineId && job.kind === "planned");
  if (reliability.wear >= (config.failureThreshold ?? 100)) {
    if (planned) {
      if (reliability.status === "available") reliability.status = "maintenance-pending";
    } else if (reliability.status !== "broken") {
      reliability.status = "broken";
      if (!state.maintenance.queue.some((job) => job.machineId === machineId && job.kind === "repair")
        && state.maintenance.activeJob?.machineId !== machineId) {
        state.maintenance.queue.push({ machineId, kind: "repair", remaining: config.repairDuration ?? 7 });
      }
    }
  }
  return state;
}

export function getMaintenanceJobView(state, machineId) {
  if (state?.maintenance?.activeJob?.machineId === machineId) {
    return { ...state.maintenance.activeJob, status: "active", queueIndex: -1 };
  }
  const queueIndex = state?.maintenance?.queue?.findIndex((job) => job.machineId === machineId) ?? -1;
  return queueIndex < 0
    ? null
    : { ...state.maintenance.queue[queueIndex], status: "queued", queueIndex };
}

function startNextMaintenance(state) {
  if (state.maintenance.activeJob) return;
  const queue = state.maintenance.queue ?? [];
  const job = queue[0];
  const machine = job ? state.machines?.[job.machineId] : null;
  if (!job || !machine || machine.active) return;
  queue.shift();
  state.maintenance.activeJob = { ...job };
  machine.reliability = {
    ...(machine.reliability ?? createMachineReliability()),
    status: "under-maintenance",
  };
}

export function advanceMaintenance(state, level, delta) {
  if (!state?.maintenance || !level?.maintenance) return state;
  const activeAtStart = state.maintenance.activeJob;
  if (activeAtStart) {
    activeAtStart.remaining -= Math.max(0, delta ?? 0);
    if (activeAtStart.remaining <= 0) {
      const machine = state.machines?.[activeAtStart.machineId];
      if (machine) {
        machine.reliability = {
          ...(machine.reliability ?? createMachineReliability()),
          wear: 0,
          status: "available",
        };
      }
      if (activeAtStart.kind === "planned") {
        state.maintenance.plannedCompleted = (state.maintenance.plannedCompleted ?? 0) + 1;
      }
      state.maintenance.activeJob = null;
    }
  }
  startNextMaintenance(state);
  return state;
}

export function canMachineAcceptMaterial(machine) {
  return !machine.reliability || machine.reliability.status === "available";
}
