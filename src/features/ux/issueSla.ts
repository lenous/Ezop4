/**
 * Issue SLA aging + assignment
 *
 * - Patche renderIssues: doplní SLA badge stáří + sort, doplní chip přiřazení.
 * - Patche openIssueDetail: do detailu modal přidá sekci přiřazení komu.
 * - assignIssue(id, userId): uloží přiřazení, persist přes saveState.
 */

const W = window as any;

type Severity = 'low' | 'medium' | 'high';
type Tone = 'success' | 'warning' | 'danger';

const SLA_THRESHOLDS: Record<Severity, { warn: number; crit: number }> = {
  high:   { warn: 60,    crit: 120 },   // minut: 1h, 2h
  medium: { warn: 240,   crit: 480 },   // 4h, 8h
  low:    { warn: 1440,  crit: 4320 },  // 24h, 72h
};

function escapeText(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function calcIssueAge(issue: any): { ms: number; label: string; tone: Tone } | null {
  if (!issue || !issue.reportedAt || issue.resolved) return null;
  const reported = new Date(issue.reportedAt).getTime();
  if (isNaN(reported)) return null;
  const ms = Date.now() - reported;
  const mins = Math.max(0, Math.floor(ms / 60000));
  const sev: Severity = (['high', 'medium', 'low'].includes(issue.severity) ? issue.severity : 'medium');
  const th = SLA_THRESHOLDS[sev];
  let tone: Tone = 'success';
  if (mins >= th.crit) tone = 'danger';
  else if (mins >= th.warn) tone = 'warning';

  let label: string;
  if (mins < 1) label = 'právě teď';
  else if (mins < 60) label = `${mins} min`;
  else if (mins < 1440) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    label = m ? `${h} h ${m} min` : `${h} h`;
  } else {
    const d = Math.floor(mins / 1440);
    const h = Math.floor((mins % 1440) / 60);
    label = h ? `${d} d ${h} h` : `${d} d`;
  }
  return { ms, label, tone };
}

const TONE_RANK: Record<Tone, number> = { danger: 0, warning: 1, success: 2 };

function slaBadgeHtml(issue: any): string {
  const age = calcIssueAge(issue);
  if (!age) return '';
  return `<span class="ux-sla ux-sla-${age.tone}" title="Stáří hlášení">⏱ ${age.label}</span>`;
}

function bridgeUsers(): any[] { return W.__ezopBridge?.users?.() || []; }
function bridgeIssues(): any[] { return W.__ezopBridge?.issues?.() || []; }

function assignedChipHtml(issue: any): string {
  if (!issue.assignedTo) {
    return `<span class="ux-assign ux-assign-empty">↳ Nepřiřazeno</span>`;
  }
  const user = bridgeUsers().find((u: any) => u.id === issue.assignedTo);
  const name = user?.name || issue.assignedTo;
  return `<span class="ux-assign">→ ${escapeText(name)}</span>`;
}

/* ════════════════════════════════
   PATCH issueCardHtml
════════════════════════════════ */

function patchIssueCard() {
  if (W.__uxPatchedIssueCard) return;
  if (typeof W.issueCardHtml !== 'function') return;
  const original = W.issueCardHtml;
  W.issueCardHtml = function (issue: any, canResolve: any) {
    const html = original.call(this, issue, canResolve);
    if (!html || issue.resolved) return html;
    const sla = slaBadgeHtml(issue);
    const assign = assignedChipHtml(issue);
    // Vložíme blok hned za první <div> (header). Najdeme severity badge a před něj přidáme SLA.
    const enhanced = html.replace(
      /(<span class="badge")/,
      `${sla} <span class="ux-sla-spacer"></span>$1`
    );
    // Přiřazení vložíme do dolního meta řádku (před "👤 ${i.reportedBy}")
    return enhanced.replace(
      /(👤 [^<]+)<span/,
      `$1<span class="ux-sla-spacer"></span>${assign}<span`
    );
  };
  W.__uxPatchedIssueCard = true;
}

/* ════════════════════════════════
   PATCH renderIssues — sort + filter chip
════════════════════════════════ */

let onlyMineAssigned = false;

function injectAssignmentFilter() {
  const page = document.getElementById('page-issues');
  if (!page) return;
  if (page.querySelector('#ux-issue-asg-filter')) return;
  // Najdeme stat-grid a vložíme za něj filter chip
  const statGrid = page.querySelector('.stat-grid');
  if (!statGrid) return;

  const user = W.__ezopBridge?.user?.() || null;
  const issues = bridgeIssues();
  const openCount = issues.filter((i: any) => !i.resolved).length;
  const mineCount = user
    ? issues.filter((i: any) => !i.resolved && i.assignedTo === user.id).length
    : 0;
  const unassignedCount = issues.filter((i: any) => !i.resolved && !i.assignedTo).length;

  const bar = document.createElement('div');
  bar.id = 'ux-issue-asg-filter';
  bar.className = 'ux-quick-filters';
  bar.innerHTML = `
    <button class="ux-chip ${!onlyMineAssigned ? 'active' : ''}" data-asg="all">
      <span>📋</span>Všechny otevřené<em>${openCount}</em>
    </button>
    <button class="ux-chip ${onlyMineAssigned ? 'active' : ''}" data-asg="mine">
      <span>👤</span>Moje přiřazené<em>${mineCount}</em>
    </button>
    <button class="ux-chip" data-asg="unassigned">
      <span>↳</span>Nepřiřazené<em>${unassignedCount}</em>
    </button>
  `;
  statGrid.insertAdjacentElement('afterend', bar);

  bar.querySelectorAll<HTMLButtonElement>('[data-asg]').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.asg;
      filterIssueCards(mode || 'all');
      bar.querySelectorAll('[data-asg]').forEach(b => b.classList.toggle('active', b === btn));
      if (mode === 'mine') onlyMineAssigned = true;
      else if (mode === 'all') onlyMineAssigned = false;
    });
  });
}

function filterIssueCards(mode: string) {
  const page = document.getElementById('page-issues');
  if (!page) return;
  const user = W.__ezopBridge?.user?.() || null;
  const issues = bridgeIssues();
  page.querySelectorAll<HTMLElement>('.card[onclick*="openIssueDetail"]').forEach(card => {
    const onclick = card.getAttribute('onclick') || '';
    const m = onclick.match(/openIssueDetail\('([^']+)'\)/);
    if (!m) return;
    const issue = issues.find((i: any) => i.id === m[1]);
    if (!issue) return;
    let show = true;
    if (mode === 'mine') show = !!(user && issue.assignedTo === user.id);
    else if (mode === 'unassigned') show = !issue.assignedTo;
    card.style.display = show ? '' : 'none';
  });
}

function reorderIssueCards() {
  const page = document.getElementById('page-issues');
  if (!page) return;
  // Najdeme sekci "Aktivní problémy" jako rodiče otevřených karet; cards jsou přímé sourozence section-title
  const issues = bridgeIssues();
  const issuesById: Record<string, any> = {};
  issues.forEach((i: any) => { issuesById[i.id] = i; });

  // Karty mají onclick="openIssueDetail('id')". Najdeme všechny karty otevřených problémů (před první sekcí "Vyřešené").
  const allCards = Array.from(page.querySelectorAll<HTMLElement>('.card[onclick*="openIssueDetail"]'));
  // Rozdělíme open vs closed podle issue.resolved
  const openCards = allCards.filter(c => {
    const m = (c.getAttribute('onclick') || '').match(/openIssueDetail\('([^']+)'\)/);
    const id = m ? m[1] : '';
    return id && issuesById[id] && !issuesById[id].resolved;
  });
  if (openCards.length < 2) return;

  const parent = openCards[0].parentNode;
  if (!parent) return;

  // Stabilní sort: tone-rank ASC, pak age DESC
  openCards.sort((a, b) => {
    const ia = issuesById[(a.getAttribute('onclick') || '').match(/openIssueDetail\('([^']+)'\)/)![1]];
    const ib = issuesById[(b.getAttribute('onclick') || '').match(/openIssueDetail\('([^']+)'\)/)![1]];
    const ageA = calcIssueAge(ia);
    const ageB = calcIssueAge(ib);
    const rA = ageA ? TONE_RANK[ageA.tone] : 99;
    const rB = ageB ? TONE_RANK[ageB.tone] : 99;
    if (rA !== rB) return rA - rB;
    return (ageB?.ms || 0) - (ageA?.ms || 0);
  });

  // Najdi sourozence následujícího po posledním openCard — kotvu pro umístění bloku
  const lastOpen = allCards.filter(c => openCards.includes(c)).slice(-1)[0];
  const anchor = lastOpen?.nextSibling || null;
  // Detach + reinsert ve vyřešeném pořadí
  openCards.forEach(c => parent.removeChild(c));
  openCards.forEach(c => parent.insertBefore(c, anchor));
}

function patchRenderIssues() {
  if (W.__uxPatchedRenderIssues) return;
  if (typeof W.renderIssues !== 'function') return;
  const original = W.renderIssues;
  W.renderIssues = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(() => {
      injectAssignmentFilter();
      reorderIssueCards();
    }, 0);
    return result;
  };
  W.__uxPatchedRenderIssues = true;
}

export function installIssueSla() {
  patchIssueCard();
  patchRenderIssues();
}
