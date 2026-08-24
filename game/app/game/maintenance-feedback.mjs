import { DEVICE_TYPES, PROCESSING_TYPES, forecastOrderCompletionTimes } from "./factory-model.mjs";
import { getMaintenanceJobView, getReliabilityView, requestMaintenance } from "./maintenance-model.mjs";

const BAND_RANK = Object.freeze({ failed: 0, danger: 1, warning: 2, normal: 3 });

function compareRisk(left, right) {
  return (BAND_RANK[left.band] ?? 4) - (BAND_RANK[right.band] ?? 4)
    || left.remainingCycles - right.remainingCycles
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function maintenanceJobFor(state, machineId) {
  return getMaintenanceJobView(state, machineId);
}

function machineViews(state, design, level) {
  return Object.values(design.devices ?? {})
    .filter((device) => PROCESSING_TYPES.has(device.type) && state.machines?.[device.id])
    .map((device) => {
      const machine = state.machines[device.id];
      const reliability = getReliabilityView(machine, device.type, level);
      return {
        id: device.id,
        type: device.type,
        label: DEVICE_TYPES[device.type].label,
        ...reliability,
        reliabilityStatus: machine.reliability?.status ?? "available",
        idle: !machine.active && !machine.waiting && !machine.output,
        maintenanceJob: maintenanceJobFor(state, device.id),
      };
    })
    .sort(compareRisk);
}

function forecastMaintenanceCandidate(candidate, state, design, level) {
  const clonedState = structuredClone(state);
  const maintainedState = requestMaintenance(clonedState, candidate.id, level);
  const completionTimes = forecastOrderCompletionTimes(
    maintainedState,
    design,
    level,
    maintainedState.queue ?? [],
  );
  const atRiskOrders = (maintainedState.orders ?? [])
    .filter((order) => order.status !== "completed" && order.status !== "overdue")
    .map((order) => ({ order, expectedAt: completionTimes.get(order.id) }))
    .filter(({ order, expectedAt }) => expectedAt === undefined || order.deadlineAt - expectedAt <= 2)
    .sort((left, right) => {
      const leftSlack = left.expectedAt === undefined ? Number.NEGATIVE_INFINITY : left.order.deadlineAt - left.expectedAt;
      const rightSlack = right.expectedAt === undefined ? Number.NEGATIVE_INFINITY : right.order.deadlineAt - right.expectedAt;
      return leftSlack - rightSlack || (left.order.id < right.order.id ? -1 : 1);
    });
  return { candidate, atRiskOrder: atRiskOrders[0]?.order ?? null };
}

function repairRecommendation(state, machines) {
  const broken = machines.find((machine) => machine.reliabilityStatus === "broken");
  if (broken) {
    const repairJob = broken.maintenanceJob?.kind === "repair" ? broken.maintenanceJob : null;
    if (repairJob?.status === "queued" && repairJob.queueIndex > 0) {
      return {
        kind: "prioritizeRepair",
        machineId: broken.id,
        message: `${broken.label}已经故障，建议把抢修任务提到队首。`,
      };
    }
    return {
      kind: "monitor",
      message: repairJob?.status === "active"
        ? `${broken.label}已经故障，维修队正在抢修。`
        : repairJob?.status === "queued"
          ? `${broken.label}已经在队首，等待维修队开始抢修。`
          : `${broken.label}已经故障，请检查维修队列。`,
    };
  }

  const queuedRepair = (state.maintenance?.queue ?? []).find((job) => job.kind === "repair");
  if (!queuedRepair) return null;
  const machine = machines.find((entry) => entry.id === queuedRepair.machineId);
  const queueIndex = state.maintenance.queue.indexOf(queuedRepair);
  if (queueIndex === 0) {
    return {
      kind: "monitor",
      message: `${machine?.label ?? "故障设备"}已经在队首，等待维修队开始抢修。`,
    };
  }
  return {
    kind: "prioritizeRepair",
    machineId: queuedRepair.machineId,
    message: `${machine?.label ?? "故障设备"}等待抢修，建议把抢修任务提到队首。`,
  };
}

function candidateRecommendation(state, design, level, machines) {
  const candidates = machines
    .filter((machine) => machine.reliabilityStatus === "available")
    .filter((machine) => machine.band === "danger"
      || (machine.remainingCycles > 0 && machine.remainingCycles <= 1))
    .slice(0, 1)
    .map((candidate) => forecastMaintenanceCandidate(candidate, state, design, level));
  const analysis = candidates[0];
  if (!analysis) return null;
  const { candidate, atRiskOrder } = analysis;
  if (atRiskOrder) {
    return {
      kind: "monitor",
      message: `${candidate.label}还能加工 ${candidate.remainingCycles} 件，但订单 ${atRiskOrder.id} 交付紧张，建议订单完成后维护。`,
    };
  }
  return {
    kind: "scheduleMaintenance",
    machineId: candidate.id,
    message: `${candidate.label}还能加工 ${candidate.remainingCycles} 件，建议现在安排维护。`,
  };
}

export function getMaintenanceFeedback({ state, design, level }) {
  const machines = machineViews(state, design, level);
  const recommendation = repairRecommendation(state, machines)
    ?? candidateRecommendation(state, design, level, machines)
    ?? { kind: "stable", message: "维护平稳：目前没有高风险设备。" };
  return { machines, recommendation };
}
