/**
 * Alert centrum — proaktivní upozornění o stavu výroby.
 *
 * Vypočítá ze stavu seznam alertů (po termínu, v ohrožení, blokované,
 * zaseknuté, nové vážné problémy). Záměrně se napojuje na EXISTUJÍCÍ
 * tlačítko #tbar-notifications — neruší vlastní plovoucí bell, sjednocuje.
 *
 * Read state perzistován v localStorage; přepočítává se každých 60 s
 * a při změně stránky.
 */

import { computeOrderEstimate } from './predictive';

const W = window as any;

const READ_KEY = 'ezop4_ux_alerts_read_v1';
const REFRESH_MS = 60_000;
const STUCK_HOURS = 24;

type AlertSeverity = 'danger' | 'warning' | 'info';

interface Alert {
  id: string;
  severity: AlertSeverity;
  icon: string;
  title: string;
  detail: string;
  orderId?: string;
  issueId?: string;
  at: number;
}

function bridge(): any { return W.__ezopBridge || null; }
function bridgeOrders(): any[] { return bridge()?.orders?.() || []; }
function bridgeIssues(): any[] { return bridge()?.issues?.() || []; }
function bridgeUser(): any { return bridge()?.user?.() || null; }

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function saveReadIds(ids: Set<string>) {
  try { localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids).slice(-500))); } catch { /* quota */ }
}

function orderAllDone(o: any): boolean {
  const sts = o.stations || [];
  return sts.length > 0 && sts.every((s: any) => s.status === 'completed' || s.status === 'skipped');
}

function orderLastActivityMs(o: any): number {
  let last = 0;
  for (const s of (o.stations || [])) {
    const t1 = s.workCompletedAt ? new Date(s.workCompletedAt).getTime() : 0;
    const t2 = s.workStartedAt ? new Date(s.workStartedAt).getTime() : 0;
    const t3 = s.workPausedAt ? new Date(s.workPausedAt).getTime() : 0;
    last = Math.max(last, t1, t2, t3);
  }
  if (!last && o.createdAt) last = new Date(o.createdAt).getTime();
  return last;
}

function ageLabel(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 48) return `${hrs} h`;
  return `${Math.round(hrs / 24)} d`;
}

function computeAlerts(): Alert[] {
  const out: Alert[] = [];
  const now = Date.now();
  const orders = bridgeOrders();
  const issues = bridgeIssues();

  for (const o of orders) {
    if (orderAllDone(o)) continue;

    if (o.due) {
      const due = new Date(o.due);
      due.setHours(23, 59, 59, 999);
      if (due.getTime() < now) {
        out.push({
          id: `overdue:${o.id}`,
          severity: 'danger',
          icon: '⏰',
          title: `Po termínu: ${o.number || o.id}`,
          detail: `${o.name || ''} · měla být hotová ${due.toLocaleDateString('cs-CZ')}`,
          orderId: o.id,
          at: due.getTime(),
        });
      }
    }

    if (o.blocked) {
      out.push({
        id: `blocked:${o.id}`,
        severity: 'warning',
        icon: '⛔',
        title: `Blokovaná zakázka: ${o.number || o.id}`,
        detail: `${o.name || ''}${o.blockedReason ? ' · ' + o.blockedReason : ''}`,
        orderId: o.id,
        at: orderLastActivityMs(o) || now,
      });
    }

    const sts = o.stations || [];
    const hasActive = sts.some((s: any) => s.status === 'in_progress' || s.status === 'progress');
    if (!hasActive && !o.blocked) {
      const last = orderLastActivityMs(o);
      const stuckHours = last ? (now - last) / 3600000 : 0;
      if (stuckHours >= STUCK_HOURS) {
        out.push({
          id: `stuck:${o.id}:${Math.floor(last / 3600000)}`,
          severity: 'warning',
          icon: '💤',
          title: `Zaseknutá: ${o.number || o.id}`,
          detail: `${o.name || ''} · žádný posun ${ageLabel(now - last)}`,
          orderId: o.id,
          at: last,
        });
      }
    }

    const est = computeOrderEstimate(o, orders);
    if (est && est.tone === 'danger') {
      out.push({
        id: `risk:${o.id}:${Math.floor(est.estimateAt.getTime() / 3600000)}`,
        severity: 'warning',
        icon: '📅',
        title: `V ohrožení: ${o.number || o.id}`,
        detail: est.label,
        orderId: o.id,
        at: est.estimateAt.getTime(),
      });
    }
  }

  for (const i of issues) {
    if (i.resolved) continue;
    if (String(i.severity).toLowerCase() !== 'high') continue;
    const reported = i.reportedAt ? new Date(i.reportedAt).getTime() : now;
    const order = orders.find((o: any) => o.id === i.orderId);
    out.push({
      id: `issue:${i.id}`,
      severity: 'danger',
      icon: '⚠️',
      title: `Vážný problém${order ? `: ${order.number}` : ''}`,
      detail: (i.description || '').slice(0, 80) || 'Bez popisu',
      orderId: i.orderId,
      issueId: i.id,
      at: reported,
    });
  }

  out.sort((a, b) => {
    const sev = (x: AlertSeverity) => x === 'danger' ? 0 : x === 'warning' ? 1 : 2;
    if (sev(a.severity) !== sev(b.severity)) return sev(a.severity) - sev(b.severity);
    return b.at - a.at;
  });

  return out;
}

/* ════════════════════════════════
   HOOK DO EXISTUJÍCÍHO ZVONKU
════════════════════════════════ */

let lastAlerts: Alert[] = [];

function updateBell() {
  if (!bridgeUser()) return;
  const alerts = computeAlerts();
  lastAlerts = alerts;
  const read = loadReadIds();
  const unread = alerts.filter(a => !read.has(a.id));
  const totalUnread = unread.length;
  const hasDanger = unread.some(a => a.severity === 'danger');

  const btn = document.getElementById('tbar-notifications');
  const countEl = document.getElementById('notification-count');
  if (!btn || !countEl) return;

  btn.style.display = '';
  btn.classList.toggle('has-unread', totalUnread > 0);
  btn.classList.toggle('ux-bell-danger', hasDanger);
  btn.classList.toggle('ux-bell-warn', !hasDanger && totalUnread > 0);
  countEl.textContent = totalUnread > 0 ? String(Math.min(99, totalUnread)) : '';
}

function hookExistingBell() {
  if (W.__uxAlertBellHooked) return;
  if (typeof W.openNotificationsModal !== 'function') return;

  W.__uxOrigOpenNotificationsModal = W.openNotificationsModal;
  W.openNotificationsModal = function (...args: any[]) {
    openAlertPanel();
    return undefined;
  };
  W.__uxAlertBellHooked = true;
}

/* ════════════════════════════════
   ALERT PANEL
════════════════════════════════ */

function openAlertPanel() {
  document.getElementById('ux-alert-panel')?.remove();
  const alerts = lastAlerts.length ? lastAlerts : computeAlerts();
  const read = loadReadIds();

  const groups: Record<string, Alert[]> = {};
  for (const a of alerts) {
    (groups[a.severity] ||= []).push(a);
  }
  const sectionOrder: AlertSeverity[] = ['danger', 'warning', 'info'];
  const sectionLabel: Record<AlertSeverity, string> = {
    danger: 'Vyžaduje pozornost',
    warning: 'Sledovat',
    info: 'Informativní',
  };

  const sections = sectionOrder.map(sev => {
    const list = groups[sev];
    if (!list || list.length === 0) return '';
    return `<div class="ux-alert-section">
      <div class="ux-alert-section-title">${sectionLabel[sev]} <em>${list.length}</em></div>
      ${list.map(a => alertRowHtml(a, read.has(a.id))).join('')}
    </div>`;
  }).join('');

  // Legacy prod notes link
  const prodNotes: any[] = W.PROD_NOTES || [];
  const legacyBtn = prodNotes.length > 0
    ? `<div class="ux-alert-legacy">
        <button class="ux-btn" id="ux-alert-open-legacy">
          📝 Výrobní zprávy (${prodNotes.length})
        </button>
      </div>`
    : '';

  const panel = document.createElement('div');
  panel.id = 'ux-alert-panel';
  panel.className = 'ux-alert-panel';
  panel.innerHTML = `
    <div class="ux-alert-panel-head">
      <div>
        <strong>🔔 Upozornění</strong>
        <small>${alerts.length} celkem · auto-refresh 60 s</small>
      </div>
      <div class="ux-alert-panel-actions">
        <button class="ux-btn" id="ux-alert-mark-all">Přečíst vše</button>
        <button class="ux-btn" id="ux-alert-close">✕</button>
      </div>
    </div>
    <div class="ux-alert-panel-body">
      ${alerts.length === 0
        ? `<div class="ux-alert-empty">😌 Žádná otevřená upozornění. Hezký den!</div>`
        : sections}
      ${legacyBtn}
    </div>
  `;
  document.body.appendChild(panel);

  const close = () => panel.remove();
  panel.querySelector('#ux-alert-close')?.addEventListener('click', close);
  panel.querySelector('#ux-alert-mark-all')?.addEventListener('click', () => {
    const r = loadReadIds();
    alerts.forEach(a => r.add(a.id));
    saveReadIds(r);
    close();
    updateBell();
  });
  panel.querySelector('#ux-alert-open-legacy')?.addEventListener('click', () => {
    close();
    if (W.__uxOrigOpenNotificationsModal) W.__uxOrigOpenNotificationsModal('all');
  });

  panel.querySelectorAll<HTMLElement>('[data-alert-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.alertId;
      const a = alerts.find(x => x.id === id);
      if (!a) return;
      const r = loadReadIds();
      r.add(a.id);
      saveReadIds(r);
      if (a.issueId && typeof W.openIssueDetail === 'function') {
        close();
        W.openIssueDetail(a.issueId);
      } else if (a.orderId && typeof W.openOrder === 'function') {
        close();
        W.openOrder(a.orderId);
      } else {
        row.classList.add('read');
      }
      updateBell();
    });
  });

  setTimeout(() => {
    const outsideClick = (e: MouseEvent) => {
      const tgt = e.target as HTMLElement;
      if (!panel.contains(tgt) && tgt?.id !== 'tbar-notifications') {
        close();
        document.removeEventListener('click', outsideClick);
      }
    };
    document.addEventListener('click', outsideClick);
  }, 50);
}

function alertRowHtml(a: Alert, read: boolean): string {
  return `<button type="button" class="ux-alert-row tone-${a.severity} ${read ? 'read' : ''}" data-alert-id="${a.id}">
    <span class="ux-alert-row-icon">${a.icon}</span>
    <div class="ux-alert-row-body">
      <div class="ux-alert-row-title">${escText(a.title)}</div>
      <div class="ux-alert-row-detail">${escText(a.detail)}</div>
    </div>
    ${!read ? '<span class="ux-alert-dot"></span>' : ''}
  </button>`;
}

function escText(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let refreshTimer: number | undefined;

export function installAlertCenter() {
  if (W.__uxAlertInstalled) return;
  W.__uxAlertInstalled = true;

  const tick = () => {
    hookExistingBell();
    updateBell();
  };
  tick();

  if (refreshTimer) window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(tick, REFRESH_MS);

  if (typeof W.navigateTo === 'function' && !W.__uxAlertNavHook) {
    const origNav = W.navigateTo;
    W.navigateTo = function (...args: any[]) {
      const r = origNav.apply(this, args);
      setTimeout(tick, 100);
      return r;
    };
    W.__uxAlertNavHook = true;
  }
}
