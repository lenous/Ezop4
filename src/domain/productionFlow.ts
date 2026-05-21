export type StationLike = {
  qtyOk?: number;
  qtyRework?: number;
  qtyScrap?: number;
  qtyReceived?: number;
  status?: string;
  workPausedAt?: string | null;
  workerUserId?: string | null;
  workerLogin?: string | null;
};

export type OrderLike = {
  number?: string;
  qty?: number;
  stations?: StationLike[];
};

export type QtyValidation = {
  sum: number;
  available: number;
  exceed: boolean;
  remaining: number;
};

export type StationFlowSnapshot = {
  processed: number;
  ok: number;
  rework: number;
  scrap: number;
  available: number;
  remaining: number;
  complete: boolean;
  hasInput: boolean;
};

export type StationWorkAction =
  | 'claim'
  | 'resume'
  | 'pause'
  | 'finish'
  | 'done'
  | 'claimed_by_other';

export type StationWorkActionInput = {
  canOperate: boolean;
  blocked: boolean;
  claimedByOther: boolean;
  claimed: boolean;
  managerRole: boolean;
  status?: string;
  paused: boolean;
};

export type QueueState = {
  label: string;
  tone: 'blocked' | 'issue' | 'active' | 'ready' | 'waiting';
  rank: number;
};

const positiveNumber = (value: unknown) => Math.max(0, Number(value) || 0);

export function orderGoodQty(order: OrderLike): number {
  const stations = Array.isArray(order.stations) ? order.stations : [];
  const maxOk = Math.max(0, ...stations.map(station => positiveNumber(station.qtyOk)));
  return Math.min(positiveNumber(order.qty), maxOk);
}

export function qtyAvailable(order: OrderLike, station: StationLike): number {
  const received = positiveNumber(station.qtyReceived);
  return received > 0 ? received : positiveNumber(order.qty);
}

export function qtyValidation(order: OrderLike, station: StationLike): QtyValidation {
  const sum = positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework) + positiveNumber(station.qtyScrap);
  const available = qtyAvailable(order, station);
  return { sum, available, exceed: sum > available, remaining: available - sum };
}

export function qtyValidationForStation(order: OrderLike, station: StationLike, index: number): QtyValidation {
  const sum = positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework) + positiveNumber(station.qtyScrap);
  const available = stationInputQty(order, station, index);
  return { sum, available, exceed: sum > available, remaining: available - sum };
}

export function readyForNextStation(station: StationLike): number {
  return positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework) + positiveNumber(station.qtyScrap);
}

export function stationProcessedQty(station: StationLike): number {
  return positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework) + positiveNumber(station.qtyScrap);
}

export function stationNonScrapQty(station: StationLike): number {
  return positiveNumber(station.qtyOk) + positiveNumber(station.qtyRework);
}

export function stationInputQty(order: OrderLike, station: StationLike, index: number): number {
  if (!order || !station) return 0;
  if (index <= 0) return positiveNumber(order.qty);
  return positiveNumber(station.qtyReceived);
}

export function stationFlowSnapshot(order: OrderLike, station: StationLike, index: number): StationFlowSnapshot {
  const available = stationInputQty(order, station, index);
  const ok = positiveNumber(station.qtyOk);
  const rework = positiveNumber(station.qtyRework);
  const scrap = positiveNumber(station.qtyScrap);
  const processed = ok + rework + scrap;
  const remaining = Math.max(0, available - processed);
  return {
    processed,
    ok,
    rework,
    scrap,
    available,
    remaining,
    complete: available > 0 && remaining === 0,
    hasInput: available > 0,
  };
}

export function syncOrderStationFlow(order: OrderLike): boolean {
  if (!order || !Array.isArray(order.stations)) return false;
  let changed = false;

  order.stations.forEach((station, index) => {
    if (index > 0) {
      const previous = order.stations?.[index - 1];
      if (previous) {
        const previousReady = readyForNextStation(previous);
        const previousScrap = positiveNumber(previous.qtyScrap);
        if (previousReady > 0 && positiveNumber(station.qtyReceived) < previousReady) {
          station.qtyReceived = previousReady;
          changed = true;
        }
        if (previousScrap > positiveNumber(station.qtyScrap)) {
          station.qtyScrap = previousScrap;
          changed = true;
        }
      }
    }

    const available = stationInputQty(order, station, index);
    if (station.status === 'completed' && stationNonScrapQty(station) === 0 && available > 0) {
      const autoOk = Math.max(0, available - positiveNumber(station.qtyScrap));
      if (positiveNumber(station.qtyOk) !== autoOk || positiveNumber(station.qtyRework) !== 0) {
        station.qtyOk = autoOk;
        station.qtyRework = 0;
        changed = true;
      }
    }

    const over = stationProcessedQty(station) - available;
    if (available > 0 && over > 0) {
      const okBefore = positiveNumber(station.qtyOk);
      const reworkBefore = positiveNumber(station.qtyRework);
      station.qtyOk = Math.max(0, okBefore - over);
      const remainingOver = over - (okBefore - station.qtyOk);
      if (remainingOver > 0) station.qtyRework = Math.max(0, reworkBefore - remainingOver);
      changed = true;
    }
  });

  return changed;
}

export function statusFromQty(validation: QtyValidation): string {
  if (validation.sum === 0) return 'waiting';
  if (validation.remaining === 0) return 'completed';
  return 'partial';
}

export function stationWorkActions(input: StationWorkActionInput): StationWorkAction[] {
  if (!input.canOperate || input.blocked) return [];
  if (input.claimedByOther) return ['claimed_by_other'];
  if (!input.claimed) return input.managerRole ? ['claim', 'finish'] : ['claim'];
  if (input.status === 'completed') return ['done'];
  if (input.paused) return ['resume', 'finish'];
  return ['pause', 'finish'];
}

export function stationQueueState(input: {
  blocked: boolean;
  status?: string;
  available: number;
  firstStation: boolean;
}): QueueState {
  if (input.blocked) return { label: 'Blokováno', tone: 'blocked', rank: 0 };
  if (input.status === 'issue') return { label: 'Problém', tone: 'issue', rank: 1 };
  if (['in_progress', 'partial'].includes(String(input.status))) {
    return { label: 'Rozpracováno', tone: 'active', rank: 2 };
  }
  if (positiveNumber(input.available) > 0 || input.firstStation) {
    return { label: 'Připraveno', tone: 'ready', rank: 3 };
  }
  return { label: 'Čeká na předchozí krok', tone: 'waiting', rank: 4 };
}

export function queueStateColor(tone: QueueState['tone']): string {
  return {
    blocked: 'var(--red)',
    issue: 'var(--red)',
    active: 'var(--blue)',
    ready: 'var(--green)',
    waiting: 'var(--amber)',
  }[tone] || 'var(--text2)';
}
