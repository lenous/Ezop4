/**
 * Detekce bottlenecku — která stanice nejvíc brzdí výrobu.
 *
 * Pro každou stanici sečteme čekající/aktivní/problémové zakázky,
 * spočítáme průměrný cycle time (z dokončených sessions za 14 dní),
 * a vyhodnotíme skóre s vysvětlením, proč právě tahle stanice je bottleneck.
 *
 * Karta se vkládá na dashboard pro admin/dispatcher/management/tpv.
 */

const W = window as any;

const LOOKBACK_DAYS = 14;

interface StationLoad {
  stId: number;
  name: string;
  icon: string;
  waiting: number;
  inProgress: number;
  issues: number;
  avgCycleHours: number;
  totalActive: number; // waiting + inProgress + issues
  score: number;
  reasons: string[];
}

function bridgeOrders(): any[] { return W.__ezopBridge?.orders?.() || []; }
function bridgeStations(): any[] { return W.__ezopBridge?.stations?.() || []; }
function bridgeUser(): any { return W.__ezopBridge?.user?.() || null; }

function shouldShow(): boolean {
  const u = bridgeUser();
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  return role === 'admin' || role === 'dispatcher' || role === 'management' || role === 'tpv';
}

function aggregate(): StationLoad[] {
  const orders = bridgeOrders();
  const stations = bridgeStations();
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;

  type Acc = {
    waiting: number;
    inProgress: number;
    issues: number;
    cycleHoursSum: number;
    cycleHoursSamples: number;
  };
  const acc = new Map<number, Acc>();
  const init = (id: number): Acc => {
    if (!acc.has(id)) acc.set(id, { waiting: 0, inProgress: 0, issues: 0, cycleHoursSum: 0, cycleHoursSamples: 0 });
    return acc.get(id)!;
  };

  for (const o of orders) {
    for (const s of (o.stations || [])) {
      const stId = Number(s.stId);
      if (!stId) continue;
      const a = init(stId);
      if (s.status === 'waiting') a.waiting++;
      if (s.status === 'in_progress' || s.status === 'progress') a.inProgress++;
      if (s.status === 'issue') a.issues++;

      const start = s.workStartedAt ? new Date(s.workStartedAt).getTime() : 0;
      const end = s.workCompletedAt ? new Date(s.workCompletedAt).getTime() : 0;
      if (start >= cutoff && end > start) {
        a.cycleHoursSum += (end - start) / 3600000;
        a.cycleHoursSamples++;
      }
    }
  }

  const result: StationLoad[] = [];
  for (const [stId, a] of acc) {
    const meta = stations.find((s: any) => Number(s.id) === stId);
    const avgCycleHours = a.cycleHoursSamples > 0 ? a.cycleHoursSum / a.cycleHoursSamples : 0;
    const totalActive = a.waiting + a.inProgress + a.issues;
    // Score: queue size weighted by cycle time, issues are heavier
    const score = (a.waiting * 1 + a.inProgress * 0.5 + a.issues * 2) * Math.max(1, avgCycleHours || 1);
    const reasons: string[] = [];
    if (a.waiting >= 3) reasons.push(`${a.waiting} čeká ve frontě`);
    if (a.issues > 0) reasons.push(`${a.issues} ${a.issues === 1 ? 'zakázka s problémem' : 'zakázek s problémem'}`);
    if (avgCycleHours > 0 && a.cycleHoursSamples >= 2) reasons.push(`průměr ${avgCycleHours.toFixed(1)} h na zakázku`);
    if (a.inProgress >= 2) reasons.push(`${a.inProgress} aktivních současně`);

    result.push({
      stId,
      name: meta?.name || `Stanice ${stId}`,
      icon: meta?.icon || '',
      waiting: a.waiting,
      inProgress: a.inProgress,
      issues: a.issues,
      avgCycleHours,
      totalActive,
      score,
      reasons,
    });
  }
  result.sort((a, b) => b.score - a.score);
  return result;
}

function escText(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCardHtml(): string {
  const all = aggregate();
  const active = all.filter(s => s.totalActive > 0 || s.avgCycleHours > 0);
  if (active.length === 0) return '';

  const top = active[0];
  const others = active.slice(1, 4);

  const reasonsText = top.reasons.length
    ? top.reasons.join(' · ')
    : 'standardní zátěž';

  const tone = top.issues > 0 ? 'danger' : top.waiting >= 3 ? 'warning' : 'info';

  const otherRows = others.map(s => `
    <div class="ux-bn-row">
      <span class="ux-bn-row-name">${escText(s.icon)} ${escText(s.name)}</span>
      <span class="ux-bn-row-stats">
        ${s.waiting > 0 ? `<em>${s.waiting} čeká</em>` : ''}
        ${s.inProgress > 0 ? `<em>${s.inProgress} běží</em>` : ''}
        ${s.issues > 0 ? `<em class="danger">${s.issues} problém</em>` : ''}
      </span>
    </div>
  `).join('');

  return `<section class="card ux-bn-card tone-${tone}">
    <div class="ux-bn-head">
      <div>
        <div class="card-title">🚦 Úzké hrdlo výroby</div>
        <div class="app-muted">Nejvíc vytížená stanice právě teď</div>
      </div>
    </div>
    <div class="ux-bn-top">
      <div class="ux-bn-top-icon">${escText(top.icon)}</div>
      <div class="ux-bn-top-text">
        <div class="ux-bn-top-name">${escText(top.name)}</div>
        <div class="ux-bn-top-reasons">${escText(reasonsText)}</div>
      </div>
      <div class="ux-bn-top-counters">
        <div title="Čeká"><b>${top.waiting}</b><span>čeká</span></div>
        <div title="Aktivní"><b>${top.inProgress}</b><span>běží</span></div>
        ${top.issues > 0 ? `<div class="danger" title="Problémy"><b>${top.issues}</b><span>problém</span></div>` : ''}
      </div>
    </div>
    ${otherRows ? `<div class="ux-bn-others">
      <div class="ux-bn-others-title">Další zatížené stanice</div>
      ${otherRows}
    </div>` : ''}
  </section>`;
}

function injectCard() {
  const page = document.getElementById('page-dashboard');
  if (!page) return;
  if (!shouldShow()) return;
  if (page.querySelector('.ux-bn-card')) return;

  const html = buildCardHtml();
  if (!html) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const card = wrap.firstElementChild as HTMLElement | null;
  if (!card) return;

  // Insert above KPI panel if it exists, else above cockpit, else after hero.
  const anchor = page.querySelector('.ux-kpi-panel')
    || page.querySelector('.app-cockpit')
    || page.querySelector('.app-page-hero')
    || page.firstElementChild;
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(card, anchor);
  } else {
    page.appendChild(card);
  }

  card.addEventListener('click', () => {
    if (typeof W.navigateTo === 'function') W.navigateTo('queue');
  });
  card.style.cursor = 'pointer';
}

function patchRenderDashboardBottleneck() {
  if (W.__uxPatchedDashboardBn) return;
  if (typeof W.renderDashboard !== 'function') return;
  const original = W.renderDashboard;
  W.renderDashboard = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(injectCard, 15);
    return result;
  };
  W.__uxPatchedDashboardBn = true;
}

export function installBottleneck() {
  patchRenderDashboardBottleneck();
}
