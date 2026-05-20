/**
 * KPI grafy na stránce KPI — čisté SVG bez závislostí.
 *
 *  - Sloupcový graf průchodnosti stanic (ks/hod, posledních 14 dnů)
 *  - Trendová křivka zmetků + oprav za posledních 7 dnů
 *  - Koláč stavů zakázek (Hotovo / Výroba / Čeká / Problém / Blokované)
 *
 * Vidí: admin, dispatcher, management, tpv.
 * Operátor: skryto (má svůj zaměřenější dashboard).
 */

const W = window as any;

type Tone = 'success' | 'warning' | 'danger' | 'info';

const DAYS_TREND = 7;

const PALETTE = {
  bar: '#4f8df9',
  barAccent: '#7aa9ff',
  scrap: '#ef4444',
  rework: '#f59e0b',
  ok: '#10b981',
  waiting: '#94a3b8',
  inProgress: '#4f8df9',
  issue: '#ef4444',
  blocked: '#6b21a8',
  done: '#10b981',
  grid: 'rgba(127,127,127,.25)',
  text: 'currentColor',
};

function bridgeOrders(): any[] { return W.__ezopBridge?.orders?.() || []; }
function bridgeStations(): any[] { return W.__ezopBridge?.stations?.() || []; }
function bridgeUser(): any { return W.__ezopBridge?.user?.() || null; }

function shouldShowCharts(): boolean {
  const u = bridgeUser();
  if (!u) return false;
  const role = String(u.role || '').toLowerCase();
  return role === 'admin' || role === 'dispatcher' || role === 'management' || role === 'tpv';
}

/* ════════════════════════════════
   DATA AGGREGATION
════════════════════════════════ */

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    keys.push(dayKey(d));
  }
  return keys;
}

interface StationThroughput {
  stId: number;
  name: string;
  icon: string;
  pph: number;     // ks za hodinu (průměr)
  okQty: number;
  sampleCount: number;
}

function aggregateStationThroughput(): StationThroughput[] {
  const orders = bridgeOrders();
  const stations = bridgeStations();
  const cutoff = Date.now() - 14 * 86400000;

  type Acc = { okQty: number; hours: number; samples: number };
  const acc = new Map<number, Acc>();

  for (const o of orders) {
    for (const s of (o.stations || [])) {
      const stId = Number(s.stId);
      if (!stId) continue;
      const start = s.workStartedAt ? new Date(s.workStartedAt).getTime() : 0;
      const end = s.workCompletedAt ? new Date(s.workCompletedAt).getTime() : 0;
      if (!start || start < cutoff) continue;
      const qty = Number(s.qtyOk) || 0;
      if (qty <= 0) continue;
      let hours = 0;
      if (end > start) {
        hours = (end - start) / 3600000;
      } else if (s.status === 'in_progress') {
        hours = (Date.now() - start) / 3600000;
      }
      if (hours <= 0.01) continue;
      const cur = acc.get(stId) || { okQty: 0, hours: 0, samples: 0 };
      cur.okQty += qty;
      cur.hours += hours;
      cur.samples += 1;
      acc.set(stId, cur);
    }
  }

  const result: StationThroughput[] = [];
  for (const [stId, a] of acc) {
    if (a.samples === 0) continue;
    const meta = stations.find((s: any) => Number(s.id) === stId);
    result.push({
      stId,
      name: meta?.name || `Stanice ${stId}`,
      icon: meta?.icon || '',
      pph: Math.round(a.okQty / a.hours),
      okQty: a.okQty,
      sampleCount: a.samples,
    });
  }
  result.sort((a, b) => b.pph - a.pph);
  return result.slice(0, 8);
}

interface QualityPoint {
  key: string;
  label: string;
  ok: number;
  scrap: number;
  rework: number;
}

function aggregateQualityTrend(): QualityPoint[] {
  const orders = bridgeOrders();
  const keys = lastNDayKeys(DAYS_TREND);
  const buckets = new Map<string, { ok: number; scrap: number; rework: number }>();
  for (const k of keys) buckets.set(k, { ok: 0, scrap: 0, rework: 0 });

  for (const o of orders) {
    for (const s of (o.stations || [])) {
      const end = s.workCompletedAt ? new Date(s.workCompletedAt) : null;
      const ref = end || (s.workStartedAt ? new Date(s.workStartedAt) : null);
      if (!ref || isNaN(ref.getTime())) continue;
      const k = dayKey(ref);
      const b = buckets.get(k);
      if (!b) continue;
      b.ok += Number(s.qtyOk) || 0;
      b.scrap += Number(s.qtyScrap) || 0;
      b.rework += Number(s.qtyRework || s.qtyRepair) || 0;
    }
  }

  return keys.map(k => {
    const d = new Date(k + 'T00:00:00');
    const label = d.toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric' });
    const b = buckets.get(k)!;
    return { key: k, label, ok: b.ok, scrap: b.scrap, rework: b.rework };
  });
}

interface StatusSlice {
  id: 'done' | 'inProgress' | 'waiting' | 'issue' | 'blocked';
  label: string;
  count: number;
  color: string;
}

function aggregateOrderStatus(): StatusSlice[] {
  const orders = bridgeOrders();
  let done = 0, inProgress = 0, waiting = 0, issue = 0, blocked = 0;
  for (const o of orders) {
    if (o.blocked) { blocked++; continue; }
    const sts = o.stations || [];
    if (sts.some((s: any) => s.status === 'issue')) { issue++; continue; }
    const allDone = sts.length > 0 && sts.every((s: any) => s.status === 'completed' || s.status === 'skipped');
    if (allDone) { done++; continue; }
    if (sts.some((s: any) => s.status === 'in_progress' || s.status === 'progress')) { inProgress++; continue; }
    waiting++;
  }
  const slices: StatusSlice[] = [
    { id: 'done',       label: 'Hotovo',    count: done,       color: PALETTE.done },
    { id: 'inProgress', label: 'Výroba',    count: inProgress, color: PALETTE.inProgress },
    { id: 'waiting',    label: 'Čeká',      count: waiting,    color: PALETTE.waiting },
    { id: 'issue',      label: 'Problém',   count: issue,      color: PALETTE.issue },
    { id: 'blocked',    label: 'Blokováno', count: blocked,    color: PALETTE.blocked },
  ];
  return slices.filter(s => s.count > 0);
}

/* ════════════════════════════════
   SVG RENDERING
════════════════════════════════ */

function escText(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function barChartSvg(data: StationThroughput[]): string {
  const W_ = 360, H = 200;
  const padL = 12, padR = 12, padT = 12, padB = 46;
  const innerW = W_ - padL - padR;
  const innerH = H - padT - padB;

  if (data.length === 0) {
    return `<div class="ux-kpi-empty">Žádná dokončená práce za posledních 14 dní.</div>`;
  }

  const max = Math.max(...data.map(d => d.pph), 1);
  const slot = innerW / data.length;
  const barW = Math.max(10, Math.min(40, slot * 0.7));

  const bars = data.map((d, i) => {
    const x = padL + slot * i + (slot - barW) / 2;
    const h = (d.pph / max) * innerH;
    const y = padT + innerH - h;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${PALETTE.bar}">
          <title>${escText(d.icon)} ${escText(d.name)}: ${d.pph} ks/h (${d.okQty} ks)</title>
        </rect>
        <text x="${x + barW / 2}" y="${y - 4}" font-size="10" text-anchor="middle" fill="${PALETTE.text}">${d.pph}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 14}" font-size="11" text-anchor="middle" fill="${PALETTE.text}">${escText(d.icon)}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 28}" font-size="9" text-anchor="middle" fill="${PALETTE.text}" opacity=".75">${escText(d.name.slice(0, 9))}</text>
      </g>
    `;
  }).join('');

  // Y axis grid (3 lines)
  const grid = [0.25, 0.5, 0.75].map(p => {
    const y = padT + innerH - innerH * p;
    return `<line x1="${padL}" y1="${y}" x2="${W_ - padR}" y2="${y}" stroke="${PALETTE.grid}" stroke-dasharray="2 3"/>`;
  }).join('');

  return `<svg viewBox="0 0 ${W_} ${H}" class="ux-kpi-svg" role="img" aria-label="Průchodnost stanic">
    ${grid}
    ${bars}
  </svg>`;
}

function trendChartSvg(data: QualityPoint[]): string {
  const W_ = 360, H = 200;
  const padL = 28, padR = 12, padT = 14, padB = 36;
  const innerW = W_ - padL - padR;
  const innerH = H - padT - padB;

  const maxOk = Math.max(...data.map(d => d.ok), 1);
  const maxBad = Math.max(...data.map(d => d.scrap + d.rework), 1);
  const max = Math.max(maxOk, maxBad * 4, 4); // OK linka má vyšší rozsah typicky

  const x = (i: number) => padL + (innerW * i) / Math.max(1, data.length - 1);
  const y = (v: number) => padT + innerH - (innerH * v) / max;

  const okPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.ok).toFixed(1)}`).join(' ');
  const scrapPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.scrap).toFixed(1)}`).join(' ');
  const reworkPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.rework).toFixed(1)}`).join(' ');

  // Grid
  const grid = [0.25, 0.5, 0.75, 1].map(p => {
    const yy = padT + innerH - innerH * p;
    const val = Math.round(max * p);
    return `
      <line x1="${padL}" y1="${yy}" x2="${W_ - padR}" y2="${yy}" stroke="${PALETTE.grid}" stroke-dasharray="2 3"/>
      <text x="${padL - 4}" y="${yy + 3}" font-size="9" text-anchor="end" fill="${PALETTE.text}" opacity=".7">${val}</text>
    `;
  }).join('');

  // X labels
  const xlabels = data.map((d, i) => `
    <text x="${x(i)}" y="${padT + innerH + 14}" font-size="9" text-anchor="middle" fill="${PALETTE.text}" opacity=".75">${escText(d.label)}</text>
  `).join('');

  // Markers
  const markers = (color: string, accessor: (d: QualityPoint) => number) =>
    data.map((d, i) => `<circle cx="${x(i)}" cy="${y(accessor(d))}" r="2.5" fill="${color}"><title>${d.label}: ${accessor(d)}</title></circle>`).join('');

  return `<svg viewBox="0 0 ${W_} ${H}" class="ux-kpi-svg" role="img" aria-label="Trend kvality 7 dní">
    ${grid}
    <path d="${okPath}" fill="none" stroke="${PALETTE.ok}" stroke-width="2"/>
    <path d="${reworkPath}" fill="none" stroke="${PALETTE.rework}" stroke-width="1.8"/>
    <path d="${scrapPath}" fill="none" stroke="${PALETTE.scrap}" stroke-width="1.8"/>
    ${markers(PALETTE.ok, d => d.ok)}
    ${markers(PALETTE.rework, d => d.rework)}
    ${markers(PALETTE.scrap, d => d.scrap)}
    ${xlabels}
  </svg>`;
}

function donutChartSvg(data: StatusSlice[]): string {
  const W_ = 240, H = 200;
  const cx = W_ / 2, cy = H / 2;
  const r = 70, rIn = 42;
  const total = data.reduce((s, x) => s + x.count, 0);

  if (total === 0) {
    return `<div class="ux-kpi-empty">Žádné zakázky.</div>`;
  }

  let start = -Math.PI / 2; // start at top
  const slices = data.map(s => {
    const angle = (s.count / total) * Math.PI * 2;
    const end = start + angle;
    const x1 = cx + Math.cos(start) * r;
    const y1 = cy + Math.sin(start) * r;
    const x2 = cx + Math.cos(end) * r;
    const y2 = cy + Math.sin(end) * r;
    const xi1 = cx + Math.cos(end) * rIn;
    const yi1 = cy + Math.sin(end) * rIn;
    const xi2 = cx + Math.cos(start) * rIn;
    const yi2 = cy + Math.sin(start) * rIn;
    const large = angle > Math.PI ? 1 : 0;
    const path = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi1},${yi1} A${rIn},${rIn} 0 ${large} 0 ${xi2},${yi2} Z`;
    start = end;
    return `<path d="${path}" fill="${s.color}"><title>${escText(s.label)}: ${s.count} (${Math.round(s.count / total * 100)}%)</title></path>`;
  }).join('');

  const legend = data.map(s => `
    <div class="ux-kpi-legend-item">
      <span class="ux-kpi-dot" style="background:${s.color}"></span>
      <span class="ux-kpi-legend-label">${escText(s.label)}</span>
      <strong>${s.count}</strong>
    </div>
  `).join('');

  return `<div class="ux-kpi-donut-wrap">
    <svg viewBox="0 0 ${W_} ${H}" class="ux-kpi-svg" role="img" aria-label="Stavy zakázek">
      ${slices}
      <text x="${cx}" y="${cy - 4}" font-size="22" text-anchor="middle" fill="${PALETTE.text}" font-weight="700">${total}</text>
      <text x="${cx}" y="${cy + 14}" font-size="10" text-anchor="middle" fill="${PALETTE.text}" opacity=".7">zakázek</text>
    </svg>
    <div class="ux-kpi-legend">${legend}</div>
  </div>`;
}

/* ════════════════════════════════
   PANEL ASSEMBLY
════════════════════════════════ */

function buildPanelHtml(): string {
  const throughput = aggregateStationThroughput();
  const quality = aggregateQualityTrend();
  const status = aggregateOrderStatus();

  const totalOk = quality.reduce((s, q) => s + q.ok, 0);
  const totalScrap = quality.reduce((s, q) => s + q.scrap, 0);
  const totalRework = quality.reduce((s, q) => s + q.rework, 0);
  const scrapPct = totalOk + totalScrap > 0
    ? (totalScrap / (totalOk + totalScrap) * 100)
    : 0;

  const scrapTone: Tone = scrapPct > 5 ? 'danger' : scrapPct > 2 ? 'warning' : 'success';
  const scrapBadge = `<span class="ux-kpi-mini ux-kpi-${scrapTone}">${scrapPct.toFixed(1)} % zmetkovitost</span>`;

  const topStation = throughput[0];
  const topBadge = topStation
    ? `<span class="ux-kpi-mini ux-kpi-info">Top: ${escText(topStation.icon)} ${escText(topStation.name)} · ${topStation.pph} ks/h</span>`
    : '';

  return `
    <section class="ux-kpi-panel">
      <div class="ux-kpi-head">
        <div>
          <div class="card-title">📊 KPI grafy</div>
          <div class="app-muted">Posledních ${DAYS_TREND} dnů · ${totalOk} OK · ${totalRework} oprav · ${totalScrap} zmetků</div>
        </div>
        <div class="ux-kpi-badges">${scrapBadge}${topBadge}</div>
      </div>
      <div class="ux-kpi-grid">
        <div class="card ux-kpi-card">
          <div class="ux-kpi-card-head">
            <span>Průchodnost stanic</span>
            <small>ks/h · top 8 · posledních 14 dnů</small>
          </div>
          ${barChartSvg(throughput)}
        </div>
        <div class="card ux-kpi-card">
          <div class="ux-kpi-card-head">
            <span>Trend kvality</span>
            <small>denní součty za posledních ${DAYS_TREND} dnů</small>
          </div>
          ${trendChartSvg(quality)}
          <div class="ux-kpi-legend ux-kpi-legend-row">
            <div class="ux-kpi-legend-item"><span class="ux-kpi-dot" style="background:${PALETTE.ok}"></span>OK</div>
            <div class="ux-kpi-legend-item"><span class="ux-kpi-dot" style="background:${PALETTE.rework}"></span>Oprava</div>
            <div class="ux-kpi-legend-item"><span class="ux-kpi-dot" style="background:${PALETTE.scrap}"></span>Zmetek</div>
          </div>
        </div>
        <div class="card ux-kpi-card">
          <div class="ux-kpi-card-head">
            <span>Stavy zakázek</span>
            <small>distribuce právě teď</small>
          </div>
          ${donutChartSvg(status)}
        </div>
      </div>
    </section>
  `;
}

function injectChartsIntoKpiPage() {
  const page = document.getElementById('page-kpi');
  if (!page) return;
  if (!shouldShowCharts()) return;
  if (page.querySelector('.ux-kpi-panel')) return;

  const html = buildPanelHtml();
  const sidePanel = page.querySelector('.kpi-layout .kpi-panel:nth-child(2)');
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const panel = wrap.firstElementChild as HTMLElement | null;
  if (!panel) return;
  panel.classList.add('ux-kpi-panel-side');
  if (sidePanel) {
    sidePanel.appendChild(panel);
  } else {
    page.appendChild(panel);
  }
}

function patchRenderKpiCharts() {
  if (W.__uxPatchedKpiCharts) return;
  if (typeof W.renderKpi !== 'function') return;
  const original = W.renderKpi;
  W.renderKpi = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(injectChartsIntoKpiPage, 20);
    return result;
  };
  W.__uxPatchedKpiCharts = true;
}

export function installKpiCharts() {
  patchRenderKpiCharts();
}
