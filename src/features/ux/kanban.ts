/**
 * Kanban board zakázek
 * Vizuální deska — zakázky jako karty rozdělené do sloupců podle stavu aktivní stanice.
 * Kliknutí na kartu = openOrder(id).
 *
 * Patche:
 *  - navigateTo  → po přepnutí na 'kanban' vykreslíme do #page-kanban
 *  - getNavItems → vložíme záložku Kanban pro role mistr/management/tpv/admin
 */

import { estimateBadgeHtml } from './predictive';

const W = window as any;

type Column = {
  id: string;
  label: string;
  icon: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
};

const COLUMNS: Column[] = [
  { id: 'blocked',   label: 'Blokované',   icon: '⛔', tone: 'danger'  },
  { id: 'issue',     label: 'S problémem', icon: '⚠️', tone: 'danger'  },
  { id: 'material',  label: 'Materiál',    icon: '📦', tone: 'info'    },
  { id: 'work',      label: 'Výroba',      icon: '🔩', tone: 'info'    },
  { id: 'control',   label: 'Kontrola',    icon: '🔍', tone: 'warning' },
  { id: 'packing',   label: 'Balení',      icon: '📫', tone: 'info'    },
  { id: 'done',      label: 'Hotovo',      icon: '✅', tone: 'success' },
  { id: 'waiting',   label: 'Čeká',        icon: '⏳', tone: 'info'    },
];

function bridgeOrders(): any[]    { return W.__ezopBridge?.orders?.() || []; }
function bridgeStations(): any[]  { return W.__ezopBridge?.stations?.() || []; }
function bridgeIssues(): any[]    { return W.__ezopBridge?.issues?.() || []; }
function bridgeUser(): any        { return W.__ezopBridge?.user?.() || null; }

type FilterId = 'all' | 'urgent' | 'late' | 'today' | 'week' | 'blocked' | 'issue' | 'mine';
const FILTERS: { id: FilterId; label: string; icon: string }[] = [
  { id: 'all',     label: 'Vše',         icon: '◯' },
  { id: 'urgent',  label: 'Urgentní',    icon: '⚡' },
  { id: 'late',    label: 'Po termínu',  icon: '⏰' },
  { id: 'today',   label: 'Dnes',        icon: '📅' },
  { id: 'week',    label: 'Tento týden', icon: '🗓' },
  { id: 'blocked', label: 'Blokované',   icon: '⛔' },
  { id: 'issue',   label: 'S problémem', icon: '⚠️' },
  { id: 'mine',    label: 'Moje',        icon: '👤' },
];
let activeFilter: FilterId = 'all';

function matchesFilter(order: any, id: FilterId, user: any): boolean {
  if (!order) return false;
  switch (id) {
    case 'all': return true;
    case 'urgent': return order.priority === 'urgent' || order.priority === 'high';
    case 'late': return isLateOrder(order);
    case 'today': {
      if (!order.due) return false;
      const d = new Date(order.due);
      const today = new Date();
      return d.toDateString() === today.toDateString();
    }
    case 'week': {
      if (!order.due) return false;
      const d = new Date(order.due);
      const now = new Date();
      const diff = (d.getTime() - now.getTime()) / 86400000;
      return diff >= 0 && diff <= 7;
    }
    case 'blocked': return !!order.blocked;
    case 'issue': return (order.stations || []).some((s: any) => s.status === 'issue');
    case 'mine': {
      if (!user) return false;
      const stationIds = (user.stationIds || []).map((n: any) => Number(n));
      const login = String(user.login || '').toLowerCase();
      return (order.stations || []).some((s: any) =>
        stationIds.includes(Number(s.stId)) ||
        (s.workerLogin && String(s.workerLogin).toLowerCase() === login)
      );
    }
  }
}

function escapeText(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function classifyOrder(order: any): string {
  if (!order) return 'waiting';
  if (order.blocked) return 'blocked';
  const sts = order.stations || [];
  if (sts.some((s: any) => s.status === 'issue')) return 'issue';

  // Najdi aktivní (in_progress) nebo první waiting po completed
  const active = sts.find((s: any) => s.status === 'in_progress');
  const target = active || sts.find((s: any) => s.status === 'waiting');

  if (!target) {
    // všechny completed/skipped
    return sts.every((s: any) => s.status === 'completed' || s.status === 'skipped') ? 'done' : 'waiting';
  }

  const stId = Number(target.stId);
  if (stId === 1) return 'material';
  if ([3, 4, 8].includes(stId)) return 'control';
  if (stId === 9) return 'packing';
  if ([2, 5, 6, 7].includes(stId)) return 'work';
  return 'work';
}

function orderProgressPct(order: any): number {
  const sts = order.stations || [];
  if (!sts.length) return 0;
  const done = sts.filter((s: any) => s.status === 'completed' || s.status === 'skipped').length;
  return Math.round((done / sts.length) * 100);
}

function activeStationLabel(order: any): string {
  const sts = order.stations || [];
  const active = sts.find((s: any) => s.status === 'in_progress')
              || sts.find((s: any) => s.status === 'issue')
              || sts.find((s: any) => s.status === 'waiting');
  if (!active) return 'Hotovo';
  const stInfo = bridgeStations().find((s: any) => Number(s.id) === Number(active.stId));
  return stInfo ? `${stInfo.icon} ${stInfo.name}` : 'Stanoviště';
}

function openIssueCountFor(orderId: string): number {
  return bridgeIssues().filter((i: any) => i.orderId === orderId && !i.resolved).length;
}

function priorityChip(priority: string): string {
  const map: Record<string, { label: string; cls: string }> = {
    urgent: { label: 'URG', cls: 'urgent' },
    high:   { label: 'HIGH', cls: 'high' },
    normal: { label: 'NORM', cls: 'normal' },
    low:    { label: 'LOW', cls: 'low' },
  };
  const p = map[priority] || map.normal;
  return `<span class="ux-kb-prio ${p.cls}">${p.label}</span>`;
}

function dueLabel(order: any): string {
  if (!order.due) return '';
  const d = new Date(order.due);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000);
  let cls = 'ok';
  if (diffDays < 0) cls = 'late';
  else if (diffDays <= 3) cls = 'soon';
  const text = d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  return `<span class="ux-kb-due ${cls}">📅 ${text}</span>`;
}

function daysLate(order: any): number {
  if (!order?.due) return 0;
  const due = new Date(order.due);
  if (isNaN(due.getTime())) return 0;
  const now = new Date();
  return Math.max(0, Math.round((now.getTime() - due.getTime()) / 86400000));
}

function isLateOrder(order: any): boolean {
  return daysLate(order) > 0;
}

function orderCardHtml(order: any): string {
  const pct = orderProgressPct(order);
  const openIssues = openIssueCountFor(order.id);
  const station = activeStationLabel(order);
  return `<div class="ux-kb-card" data-order-id="${escapeText(order.id)}">
    <div class="ux-kb-card-head">
      <span class="ux-kb-num">${escapeText(order.number || '')}</span>
      ${priorityChip(order.priority || 'normal')}
    </div>
    <div class="ux-kb-name">${escapeText(order.name || '')}</div>
    <div class="ux-kb-customer">${escapeText(order.customer || '')}</div>
    <div class="ux-kb-station">${escapeText(station)}</div>
    <div class="ux-kb-meta">
      ${dueLabel(order)}
      ${openIssues ? `<span class="ux-kb-issues">⚠️ ${openIssues}</span>` : ''}
      <span class="ux-kb-qty">${order.qty || 0} ks</span>
      ${estimateBadgeHtml(order)}
    </div>
    <div class="ux-kb-progress"><div class="ux-kb-progress-bar" style="width:${pct}%"></div></div>
  </div>`;
}

function emptyColHtml(): string {
  return `<div class="ux-kb-empty">Nic zde</div>`;
}

function userCanSeeOrder(order: any, user: any): boolean {
  if (!user) return false;
  const role = String(user.role || '');
  if (['admin', 'dispatcher', 'management', 'tpv'].includes(role)) return true;
  // operator: musí mít přístup ke stanici zakázky
  const stationIds = (user.stationIds || []).map((n: any) => Number(n));
  return (order.stations || []).some((s: any) => stationIds.includes(Number(s.stId)));
}

export function renderKanbanPage() {
  const root = document.getElementById('page-kanban');
  if (!root) return;
  const orders = bridgeOrders();
  const user = bridgeUser();
  const visible = orders
    .filter(o => userCanSeeOrder(o, user))
    .filter(o => matchesFilter(o, activeFilter, user));

  // Rozdělení do sloupců
  const buckets: Record<string, any[]> = {};
  COLUMNS.forEach(c => { buckets[c.id] = []; });
  visible.forEach(o => {
    const col = classifyOrder(o);
    if (buckets[col]) buckets[col].push(o);
    else buckets.waiting.push(o);
  });

  // Order in each column by priority (urgent>high>normal>low) then due asc
  const prioRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  Object.keys(buckets).forEach(k => {
    buckets[k].sort((a: any, b: any) => {
      const pa = prioRank[a.priority] ?? 2;
      const pb = prioRank[b.priority] ?? 2;
      if (pa !== pb) return pa - pb;
      const da = new Date(a.due || '9999-12-31').getTime();
      const db = new Date(b.due || '9999-12-31').getTime();
      return da - db;
    });
  });

  // Skryj prázdné sloupce s nulou ve specifických kategoriích (jen blocked a issue, ostatní zachovat pro orientaci)
  const cols = COLUMNS.filter(c => {
    if (c.id === 'blocked' || c.id === 'issue') return buckets[c.id].length > 0;
    return true;
  });

  // Filter counts use orders visible-to-user (not filtered ones)
  const visibleToUser = orders.filter(o => userCanSeeOrder(o, user));
  const filterCount = (id: FilterId) => visibleToUser.filter(o => matchesFilter(o, id, user)).length;
  const filterChips = FILTERS.map(f => {
    const active = activeFilter === f.id ? 'active' : '';
    return `<button class="ux-chip ${active}" data-kb-filter="${f.id}">
      <span>${f.icon}</span>${f.label}<em>${filterCount(f.id)}</em>
    </button>`;
  }).join('');
  const lateOrders = visibleToUser.filter(isLateOrder);
  const issueOrders = visibleToUser.filter(o => (o.stations || []).some((s: any) => s.status === 'issue'));
  const urgentOrders = visibleToUser.filter(o => o.priority === 'urgent' || o.priority === 'high');
  const activeOrders = visibleToUser.filter(o => !['done', 'waiting'].includes(classifyOrder(o)));
  const bottleneck = cols
    .map(c => ({ ...c, count: buckets[c.id].length }))
    .sort((a, b) => b.count - a.count)[0];
  const focusOrder = visible.find((o: any) => o.blocked)
    || visible.find((o: any) => (o.stations || []).some((s: any) => s.status === 'issue'))
    || visible.find(isLateOrder)
    || visible.find((o: any) => o.priority === 'urgent' || o.priority === 'high')
    || visible[0];
  const focusStation = focusOrder ? activeStationLabel(focusOrder) : '';

  root.innerHTML = `
    <div class="ux-kb-header">
      <div>
        <div class="app-page-title"><strong>📌 Kanban</strong></div>
        <div class="app-page-subtitle">${visible.length} z ${visibleToUser.length} zakázek · tok výroby podle aktivního kroku</div>
      </div>
      <button class="btn btn-ghost btn-sm" id="ux-kb-refresh">🔄 Obnovit</button>
    </div>

    <section class="ux-kb-command">
      <div class="ux-kb-command-main">
        <div class="app-shift-label"><span>📌</span><strong>Tok výroby</strong></div>
        <h2>${bottleneck ? `${bottleneck.icon} ${escapeText(bottleneck.label)}` : 'Bez toku'}</h2>
        <p>${bottleneck ? `${bottleneck.count} položek v nejsilnějším sloupci · ${visible.length} zobrazených zakázek` : 'Pro aktuální filtr nejsou dostupné zakázky.'}</p>
        <div class="ux-kb-command-metrics">
          <button type="button" data-kb-filter="all"><span>${visibleToUser.length}</span><strong>Vše</strong></button>
          <button type="button" data-kb-filter="urgent"><span>${urgentOrders.length}</span><strong>Urgentní</strong></button>
          <button type="button" data-kb-filter="issue"><span>${issueOrders.length}</span><strong>Problémy</strong></button>
          <button type="button" data-kb-filter="late"><span>${lateOrders.length}</span><strong>Po termínu</strong></button>
        </div>
      </div>
      <div class="ux-kb-command-side">
        ${focusOrder ? `
          <button class="ux-kb-focus-card" type="button" id="ux-kb-focus-open">
            <span>${focusOrder.blocked ? '⛔' : openIssueCountFor(focusOrder.id) ? '⚠️' : isLateOrder(focusOrder) ? '⏰' : '📋'}</span>
            <div>
              <strong>${escapeText(focusOrder.number || '')} · ${escapeText(focusOrder.name || '')}</strong>
              <em>${escapeText(focusStation)}${isLateOrder(focusOrder) ? ` · ${daysLate(focusOrder)} dní po termínu` : ''}</em>
            </div>
            <b>Otevřít</b>
          </button>
        ` : `<div class="ux-kb-focus-card ux-kb-focus-empty">Bez zakázky k otevření</div>`}
        <div class="ux-kb-quality">
          <div><span>${activeOrders.length}</span><em>v toku</em></div>
          <div><span>${bottleneck?.count || 0}</span><em>úzké místo</em></div>
          <div><span>${issueOrders.length}</span><em>problémy</em></div>
        </div>
      </div>
    </section>

    <div class="ux-quick-filters" id="ux-kb-filters">${filterChips}</div>
    <div class="ux-kanban">
      ${cols.map(c => `
        <div class="ux-kb-col tone-${c.tone}" data-col="${c.id}">
          <div class="ux-kb-col-head">
            <span class="ux-kb-col-title">${c.icon} ${c.label}</span>
            <span class="ux-kb-col-count">${buckets[c.id].length}</span>
          </div>
          <div class="ux-kb-col-body">
            ${buckets[c.id].length ? buckets[c.id].map(orderCardHtml).join('') : emptyColHtml()}
          </div>
        </div>
      `).join('')}
    </div>
  `;

  // Card click → openOrder
  root.querySelectorAll<HTMLElement>('.ux-kb-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.orderId;
      if (id) W.__ezopBridge?.openOrder?.(id);
    });
  });

  // Refresh
  document.getElementById('ux-kb-refresh')?.addEventListener('click', () => renderKanbanPage());
  document.getElementById('ux-kb-focus-open')?.addEventListener('click', () => {
    if (focusOrder?.id) W.__ezopBridge?.openOrder?.(focusOrder.id);
  });

  // Filter chips
  root.querySelectorAll<HTMLButtonElement>('[data-kb-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.kbFilter as FilterId;
      renderKanbanPage();
    });
  });
}

function patchNavigation() {
  if (W.__uxPatchedKanbanNav) return;
  if (typeof W.navigateTo !== 'function' || typeof W.getNavItems !== 'function') return;

  const originalNav = W.navigateTo;
  W.navigateTo = function (page: string, options: any) {
    const result = originalNav.call(this, page, options);
    if (page === 'kanban') {
      setTimeout(renderKanbanPage, 0);
    }
    return result;
  };

  const originalItems = W.getNavItems;
  W.getNavItems = function () {
    const items = originalItems.call(this) || [];
    const user = bridgeUser();
    const role = String(user?.role || '');
    if (['admin', 'dispatcher', 'management', 'tpv'].includes(role)) {
      const idx = items.findIndex((i: any) => i.id === 'dashboard');
      const insertAt = idx >= 0 ? idx + 1 : 0;
      const exists = items.some((i: any) => i.id === 'kanban');
      if (!exists) {
        items.splice(insertAt, 0, { id: 'kanban', label: 'Kanban', icon: '📌' });
      }
    }
    return items;
  };

  W.__uxPatchedKanbanNav = true;
}

export function installKanbanPatch() {
  W.__ezopRenderKanban = renderKanbanPage;
  patchNavigation();
}
