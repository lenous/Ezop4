/**
 * Pareto analýza problémů — kde a proč nás trápí.
 *
 * Issues seskupené podle stanice (a sekundárně podle typu z popisu)
 * vykreslené jako Pareto chart (sloupce + kumulativní křivka 80 %).
 * Vidíme top příčiny, které by řešení nejvíc pomohlo.
 *
 * Karta se vkládá nad seznam problémů na #page-issues.
 */

const W = window as any;

const LOOKBACK_DAYS = 30;

interface ParetoBucket {
  key: string;
  label: string;
  icon: string;
  count: number;
  unresolved: number;
}

function bridgeIssues(): any[] { return W.__ezopBridge?.issues?.() || []; }
function bridgeStations(): any[] { return W.__ezopBridge?.stations?.() || []; }

function aggregateByStation(): ParetoBucket[] {
  const issues = bridgeIssues();
  const stations = bridgeStations();
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400000;

  type Acc = { count: number; unresolved: number };
  const acc = new Map<string, Acc>();
  for (const i of issues) {
    const reported = i.reportedAt ? new Date(i.reportedAt).getTime() : 0;
    if (reported && reported < cutoff) continue;
    const stId = String(i.stationId ?? '');
    const key = stId || 'unknown';
    const cur = acc.get(key) || { count: 0, unresolved: 0 };
    cur.count++;
    if (!i.resolved) cur.unresolved++;
    acc.set(key, cur);
  }

  const result: ParetoBucket[] = [];
  for (const [key, a] of acc) {
    const meta = stations.find((s: any) => String(s.id) === key);
    result.push({
      key,
      label: meta?.name || (key === 'unknown' ? 'Bez stanice' : `Stanice ${key}`),
      icon: meta?.icon || '•',
      count: a.count,
      unresolved: a.unresolved,
    });
  }
  result.sort((a, b) => b.count - a.count);
  return result.slice(0, 6);
}

function escText(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function paretoSvg(buckets: ParetoBucket[]): string {
  const W_ = 520, H = 240;
  const padL = 40, padR = 40, padT = 16, padB = 60;
  const innerW = W_ - padL - padR;
  const innerH = H - padT - padB;

  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) return '';

  const max = Math.max(...buckets.map(b => b.count), 1);
  const slot = innerW / buckets.length;
  const barW = Math.max(20, slot * 0.65);

  // Bars
  const bars = buckets.map((b, i) => {
    const x = padL + slot * i + (slot - barW) / 2;
    const h = (b.count / max) * innerH;
    const y = padT + innerH - h;
    const unresHeight = (b.unresolved / max) * innerH;
    const unresY = padT + innerH - unresHeight;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="#4f8df9" opacity=".5"><title>${escText(b.label)}: ${b.count} problémů</title></rect>
        <rect x="${x}" y="${unresY}" width="${barW}" height="${unresHeight}" rx="3" fill="#ef4444"><title>${escText(b.label)}: ${b.unresolved} otevřených</title></rect>
        <text x="${x + barW / 2}" y="${y - 6}" font-size="11" font-weight="700" text-anchor="middle" fill="currentColor">${b.count}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 16}" font-size="14" text-anchor="middle" fill="currentColor">${escText(b.icon)}</text>
        <text x="${x + barW / 2}" y="${padT + innerH + 32}" font-size="10" text-anchor="middle" fill="currentColor" opacity=".75">${escText(b.label.slice(0, 10))}</text>
        ${b.label.length > 10 ? `<text x="${x + barW / 2}" y="${padT + innerH + 44}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">${escText(b.label.slice(10, 20))}</text>` : ''}
      </g>
    `;
  }).join('');

  // Cumulative curve (right axis %)
  let cumulative = 0;
  const points = buckets.map((b, i) => {
    cumulative += b.count;
    const pct = cumulative / total;
    const x = padL + slot * i + slot / 2;
    const y = padT + innerH - (pct * innerH);
    return { x, y, pct };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const dots = points.map(p => `
    <circle cx="${p.x}" cy="${p.y}" r="3.5" fill="#f59e0b"/>
    <text x="${p.x}" y="${p.y - 8}" font-size="10" font-weight="700" text-anchor="middle" fill="#f59e0b">${Math.round(p.pct * 100)}%</text>
  `).join('');

  // 80 % reference line
  const y80 = padT + innerH - 0.8 * innerH;
  const ref = `<line x1="${padL}" y1="${y80}" x2="${W_ - padR}" y2="${y80}" stroke="#f59e0b" stroke-dasharray="3 3" opacity=".5"/>
    <text x="${W_ - padR + 2}" y="${y80 + 3}" font-size="9" fill="#f59e0b">80%</text>`;

  // Y axis labels
  const yLabels = [0.25, 0.5, 0.75, 1].map(p => {
    const y = padT + innerH - innerH * p;
    return `<text x="${padL - 4}" y="${y + 3}" font-size="9" text-anchor="end" fill="currentColor" opacity=".6">${Math.round(max * p)}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W_} ${H}" class="ux-pareto-svg" role="img" aria-label="Pareto analýza problémů">
    ${ref}
    ${yLabels}
    ${bars}
    <path d="${pathD}" fill="none" stroke="#f59e0b" stroke-width="2"/>
    ${dots}
  </svg>`;
}

function buildCardHtml(): string {
  const buckets = aggregateByStation();
  const total = buckets.reduce((s, b) => s + b.count, 0);
  if (total === 0) return '';

  const top = buckets[0];
  const topPct = Math.round(top.count / total * 100);
  const rows = buckets.slice(0, 4).map(b => {
    const pct = Math.round((b.count / total) * 100);
    return `
      <div class="ux-issue-summary-row">
        <span>${escText(b.icon)}</span>
        <b>${escText(b.label)}</b>
        <em>${b.unresolved} otevřené / ${b.count} celkem</em>
        <i style="width:${pct}%"></i>
      </div>`;
  }).join('');

  return `<details class="advanced-panel ux-issue-summary-panel">
    <summary>
      <span>Souhrn problémů</span>
      <span class="advanced-panel-subtitle">${total} za ${LOOKBACK_DAYS} dnů · nejvíc ${escText(top.label)} (${topPct} %)</span>
    </summary>
    <div class="advanced-panel-body">
      <div class="ux-issue-summary-card">
        <div class="ux-issue-summary-head">
          <strong>Kde se problémy hromadí</strong>
          <small>Stručný přehled podle stanovišť. Detailní řešení je níže v seznamu problémů.</small>
        </div>
        <div class="ux-issue-summary-list">${rows}</div>
      </div>
    </div>
  </details>`;
}

function injectCard() {
  const page = document.getElementById('page-issues');
  if (!page) return;
  if (page.querySelector('.ux-pareto-card')) return;

  const html = buildCardHtml();
  if (!html) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  const card = wrap.firstElementChild as HTMLElement | null;
  if (!card) return;

  const anchor = page.querySelector('.stat-grid');
  if (anchor) {
    anchor.insertAdjacentElement('afterend', card);
  } else {
    page.prepend(card);
  }
}

function patchRenderIssuesPareto() {
  if (W.__uxPatchedIssuesPareto) return;
  if (typeof W.renderIssues !== 'function') return;
  const original = W.renderIssues;
  W.renderIssues = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(injectCard, 20);
    return result;
  };
  W.__uxPatchedIssuesPareto = true;
}

export function installIssueAnalysis() {
  patchRenderIssuesPareto();
}
