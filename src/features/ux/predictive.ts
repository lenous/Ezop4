/**
 * Prediktivní termín dokončení zakázky
 *
 * Z historických timestampů (workStartedAt/workCompletedAt) a aktuálních
 * qtyOk/qtyRework spočítáme rychlost na stanici a odhadneme reálný termín.
 * Porovnáme s order.due → tón (green/amber/red/grey).
 *
 * Patche:
 *  - openOrder → inject karty s odhadem nad timeline
 *  - renderOrders → doplnit malý badge u každé zakázky v seznamu
 *  - renderKanbanPage (přes re-export hook) → karta dostane badge
 *  - renderDashboard → KPI tile "Zakázky v ohrožení"
 */

const W = window as any;

const DEFAULT_THROUGHPUT_PCS_PER_HOUR = 60;

/* ════════════════════════════════
   SHIFT-AWARE TIME CALCULATION
════════════════════════════════ */

const SHIFT_PROFILE_KEY = 'ezop4_ux_shift_profile_v1';

export interface ShiftProfile {
  startHour: number;   // 0–23
  endHour: number;     // 1–24 (24 = midnight; > startHour)
  weekdays: number[];  // 0 = Sunday … 6 = Saturday
}

const DEFAULT_SHIFT_PROFILE: ShiftProfile = {
  startHour: 6,
  endHour: 22,        // dvě směny 6–14 a 14–22 = 16 h/den
  weekdays: [1, 2, 3, 4, 5],
};

export function loadShiftProfile(): ShiftProfile {
  try {
    const raw = localStorage.getItem(SHIFT_PROFILE_KEY);
    if (!raw) return { ...DEFAULT_SHIFT_PROFILE };
    const parsed = JSON.parse(raw);
    const startHour = Number(parsed.startHour);
    const endHour = Number(parsed.endHour);
    const weekdays = Array.isArray(parsed.weekdays) ? parsed.weekdays.map((x: any) => Number(x)).filter((x: number) => x >= 0 && x <= 6) : null;
    if (isNaN(startHour) || isNaN(endHour) || endHour <= startHour || !weekdays || weekdays.length === 0) {
      return { ...DEFAULT_SHIFT_PROFILE };
    }
    return { startHour, endHour, weekdays };
  } catch {
    return { ...DEFAULT_SHIFT_PROFILE };
  }
}

export function saveShiftProfile(profile: ShiftProfile) {
  try { localStorage.setItem(SHIFT_PROFILE_KEY, JSON.stringify(profile)); } catch { /* quota */ }
  cacheKey = ''; // invalidate cached estimates
}

function shiftHoursPerDay(p: ShiftProfile): number {
  return p.endHour - p.startHour;
}

function isWorkingDay(d: Date, p: ShiftProfile): boolean {
  return p.weekdays.includes(d.getDay());
}

function startOfWorkdayAtDate(d: Date, p: ShiftProfile): Date {
  const r = new Date(d);
  r.setHours(p.startHour, 0, 0, 0);
  return r;
}

function endOfWorkdayAtDate(d: Date, p: ShiftProfile): Date {
  const r = new Date(d);
  if (p.endHour >= 24) {
    r.setHours(0, 0, 0, 0);
    r.setDate(r.getDate() + 1);
  } else {
    r.setHours(p.endHour, 0, 0, 0);
  }
  return r;
}

function nextWorkingDayStart(d: Date, p: ShiftProfile): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + 1);
  next.setHours(p.startHour, 0, 0, 0);
  let guard = 0;
  while (!isWorkingDay(next, p) && guard < 14) {
    next.setDate(next.getDate() + 1);
    guard++;
  }
  return next;
}

/** Posune `from` dopředu o `hours` pracovních hodin podle profilu. */
function addWorkingHours(from: Date, hours: number, p: ShiftProfile): Date {
  if (hours <= 0) return new Date(from);
  if (shiftHoursPerDay(p) <= 0) return new Date(from.getTime() + hours * 3600000);

  let current = new Date(from);
  let remaining = hours;
  let guard = 0;

  while (remaining > 0 && guard < 365) {
    guard++;
    if (!isWorkingDay(current, p)) {
      current = nextWorkingDayStart(current, p);
      continue;
    }
    const dayStart = startOfWorkdayAtDate(current, p);
    const dayEnd = endOfWorkdayAtDate(current, p);
    if (current < dayStart) current = dayStart;
    if (current >= dayEnd) {
      current = nextWorkingDayStart(current, p);
      continue;
    }
    const availableMs = dayEnd.getTime() - current.getTime();
    const availableHours = availableMs / 3600000;
    if (availableHours >= remaining) {
      current = new Date(current.getTime() + remaining * 3600000);
      remaining = 0;
    } else {
      remaining -= availableHours;
      current = nextWorkingDayStart(current, p);
    }
  }
  return current;
}

type Tone = 'success' | 'warning' | 'danger' | 'muted';
export type Estimate = {
  estimateAt: Date;
  diffMs: number; // estimateAt - dueDate
  tone: Tone;
  label: string;
  short: string;
};

const estimateCache = new WeakMap<object, Estimate | null>();
let cacheKey = '';

function bridgeOrders(): any[] { return W.__ezopBridge?.orders?.() || []; }

function invalidateCacheIfStale() {
  const orders = bridgeOrders();
  const key = orders.length + ':' + (orders[0]?.id || '') + ':' + (orders[orders.length - 1]?.id || '');
  if (key !== cacheKey) {
    cacheKey = key;
    // WeakMap se nedá vyčistit najednou — necháme GC; jen invalidujeme klíč
  }
}

function stationDurationHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (isNaN(a) || isNaN(b) || b <= a) return 0;
  return (b - a) / 3600000;
}

function stationThroughputPph(stId: number, allOrders: any[]): number {
  const samples: number[] = [];
  for (const o of allOrders) {
    for (const s of o.stations || []) {
      if (Number(s.stId) !== Number(stId)) continue;
      const hrs = stationDurationHours(s.workStartedAt, s.workCompletedAt);
      const qty = (Number(s.qtyOk) || 0) + (Number(s.qtyRework) || 0);
      if (hrs > 0 && qty > 0) {
        samples.push(qty / hrs);
      }
    }
  }
  if (samples.length === 0) return DEFAULT_THROUGHPUT_PCS_PER_HOUR;
  // Použít posledních 5 (samples už jsou v pořadí dle iterace)
  const recent = samples.slice(-5);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Math.max(1, avg);
}

function computeRemainingHours(order: any, allOrders: any[]): { hours: number; hasData: boolean } {
  const sts = order.stations || [];
  let totalHours = 0;
  let hasAnyData = false;

  for (const s of sts) {
    if (s.status === 'completed' || s.status === 'skipped') continue;
    const targetQty = Number(order.qty) || 0;
    const doneQty = Number(s.qtyOk) || 0;
    const remaining = Math.max(0, targetQty - doneQty);
    if (remaining === 0) continue;
    const pph = stationThroughputPph(Number(s.stId), allOrders);
    if (pph > 0) hasAnyData = true;
    totalHours += remaining / pph;
  }
  return { hours: totalHours, hasData: hasAnyData };
}

export function computeOrderEstimate(order: any, allOrders?: any[]): Estimate | null {
  if (!order) return null;
  invalidateCacheIfStale();
  if (estimateCache.has(order)) return estimateCache.get(order)!;

  const orders = allOrders || bridgeOrders();
  const sts = order.stations || [];
  const allDone = sts.length > 0 && sts.every((s: any) => s.status === 'completed' || s.status === 'skipped');
  if (allDone) {
    const result: Estimate = {
      estimateAt: new Date(),
      diffMs: 0,
      tone: 'success',
      label: 'Hotovo',
      short: '✅ hotovo',
    };
    estimateCache.set(order, result);
    return result;
  }

  const { hours, hasData } = computeRemainingHours(order, orders);
  if (!hasData && hours === 0) {
    estimateCache.set(order, null);
    return null;
  }

  const profile = loadShiftProfile();
  const estimateAt = addWorkingHours(new Date(), hours, profile);

  if (!order.due) {
    const result: Estimate = {
      estimateAt,
      diffMs: 0,
      tone: 'muted',
      label: `Odhad: ${estimateAt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}`,
      short: estimateAt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }),
    };
    estimateCache.set(order, result);
    return result;
  }

  const due = new Date(order.due);
  due.setHours(23, 59, 59, 999); // splnění do konce due dne
  const diffMs = estimateAt.getTime() - due.getTime();
  const diffDays = Math.round(diffMs / 86400000);

  let tone: Tone = 'success';
  let label: string;
  let short: string;
  const estText = estimateAt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  if (diffMs > 86400000) {
    tone = 'danger';
    label = `Skluz ${diffDays} d (odhad ${estText})`;
    short = `🔴 skluz ${diffDays} d`;
  } else if (diffMs > -86400000) {
    tone = 'warning';
    label = `Hraniční termín (odhad ${estText})`;
    short = `🟡 hraničně`;
  } else {
    tone = 'success';
    const ahead = Math.abs(diffDays);
    label = `V termínu, ${ahead} d rezerva (odhad ${estText})`;
    short = `🟢 v termínu`;
  }

  const result: Estimate = { estimateAt, diffMs, tone, label, short };
  estimateCache.set(order, result);
  return result;
}

function estimateCardHtml(order: any): string {
  const est = computeOrderEstimate(order);
  if (!est) {
    return `<div class="card ux-est-card tone-muted">
      <div class="ux-est-row">
        <span class="ux-est-icon">📅</span>
        <div class="ux-est-text">
          <b>Odhad dokončení: zatím nelze spočítat</b>
          <small>Jakmile bude na stanicích dokončen alespoň jeden cyklus, zobrazí se odhad reálného data.</small>
        </div>
      </div>
    </div>`;
  }
  const dueLabel = order.due
    ? `<small>Plán: ${new Date(order.due).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</small>`
    : '';
  const estLabel = est.estimateAt.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `<div class="card ux-est-card tone-${est.tone}">
    <div class="ux-est-row">
      <span class="ux-est-icon">📅</span>
      <div class="ux-est-text">
        <b>Odhad dokončení: ${estLabel}</b>
        <span class="ux-est-status">${est.label}</span>
        ${dueLabel}
      </div>
    </div>
  </div>`;
}

export function estimateBadgeHtml(order: any): string {
  const est = computeOrderEstimate(order);
  if (!est) return `<span class="ux-est-pill ux-est-muted" title="Odhad nedostupný">📅 —</span>`;
  return `<span class="ux-est-pill ux-est-${est.tone}" title="${est.label}">${est.short}</span>`;
}

export function decorateOrderListBadges() {
  const page = document.getElementById('page-orders');
  if (!page) return;
  const orders = bridgeOrders();
  page.querySelectorAll<HTMLElement>('.app-order-card').forEach(card => {
    if (card.querySelector('.ux-est-pill')) return;
    const onclick = card.getAttribute('onclick') || '';
    const m = onclick.match(/openOrder\('([^']+)'\)/);
    if (!m) return;
    const order = orders.find((o: any) => o.id === m[1]);
    if (!order) return;
    // Vlož badge vedle čísla zakázky / priority
    const priorityRow = card.querySelector('.badge-' + (order.priority || 'normal'))
      || card.querySelector('[class^="badge-"]');
    const badge = document.createElement('span');
    badge.innerHTML = estimateBadgeHtml(order);
    const pill = badge.firstChild as HTMLElement | null;
    if (!pill) return;
    if (priorityRow && priorityRow.parentElement) {
      priorityRow.parentElement.insertBefore(pill, priorityRow.nextSibling);
    } else {
      card.appendChild(pill);
    }
  });
}

export function dangerOrderCount(): number {
  let n = 0;
  for (const o of bridgeOrders()) {
    const est = computeOrderEstimate(o);
    if (est && (est.tone === 'danger' || est.tone === 'warning')) n++;
  }
  return n;
}

function patchRenderOrdersEstimate() {
  if (W.__uxPatchedRenderOrdersEst) return;
  if (typeof W.renderOrders !== 'function') return;
  const original = W.renderOrders;
  W.renderOrders = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(decorateOrderListBadges, 0);
    return result;
  };
  W.__uxPatchedRenderOrdersEst = true;
}

function patchRenderDashboardEstimate() {
  if (W.__uxPatchedDashboardEst) return;
  if (typeof W.renderDashboard !== 'function') return;
  const original = W.renderDashboard;
  W.renderDashboard = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(() => {
      const page = document.getElementById('page-dashboard');
      if (!page || page.querySelector('.ux-est-dash-tile')) return;
      const danger = dangerOrderCount();
      if (danger === 0) return;
      const tile = document.createElement('div');
      tile.className = 'card ux-est-dash-tile';
      tile.innerHTML = `
        <div class="ux-est-row">
          <span class="ux-est-icon">⚠️</span>
          <div class="ux-est-text">
            <b>Zakázky v ohrožení: ${danger}</b>
            <span class="ux-est-status">Odhadovaný termín dokončení je hraniční nebo po plánovaném datu.</span>
            <small>Klikni pro otevření Kanbanu se seznamem.</small>
          </div>
        </div>
      `;
      tile.style.cursor = 'pointer';
      tile.addEventListener('click', () => {
        if (typeof W.navigateTo === 'function') W.navigateTo('kanban');
      });
      const dashboardMain = page.querySelector('.dashboard-main-col');
      if (dashboardMain) dashboardMain.appendChild(tile);
      else {
        const hero = page.querySelector('.app-page-hero');
        if (hero) hero.insertAdjacentElement('afterend', tile);
        else page.prepend(tile);
      }
    }, 10);
    return result;
  };
  W.__uxPatchedDashboardEst = true;
}

function patchOpenOrderEstimate() {
  if (W.__uxPatchedOrderEstimate) return;
  if (typeof W.openOrder !== 'function') return;
  const original = W.openOrder;
  W.openOrder = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(() => {
      const page = document.getElementById('page-station');
      if (!page || page.querySelector('.ux-est-card')) return;
      const orderId = args[0];
      const order = bridgeOrders().find((o: any) => o.id === orderId);
      if (!order) return;
      // Vlož kartu nad timeline-card, jinak na začátek stránky
      const timeline = page.querySelector('.ux-tl-card, .order-timeline-card');
      const html = estimateCardHtml(order);
      if (timeline) {
        timeline.insertAdjacentHTML('beforebegin', html);
      } else {
        const firstCard = page.querySelector('.card');
        if (firstCard) firstCard.insertAdjacentHTML('afterend', html);
      }
    }, 10);
    return result;
  };
  W.__uxPatchedOrderEstimate = true;
}

export function installPredictive() {
  patchOpenOrderEstimate();
  patchRenderOrdersEstimate();
  patchRenderDashboardEstimate();
}
