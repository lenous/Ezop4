/**
 * UX Enhancements pro Ezop4.
 *
 * Tento modul nesahá na legacy runtime — pouze přidává overlay UI
 * (FAB, panely, banner, toast) a používá globály, které runtime
 * vystavuje na window (currentUser, currentPage, showToast,
 * navigateTo, EZOP4_AUDIT, ...).
 */

import { installPatches } from './patches';

type ThemeMode = 'auto' | 'night' | 'normal';

interface UxState {
  themeMode: ThemeMode;
  bigMode: boolean;
  quietMode: boolean;
  feedbackCount: number;
}

const STORAGE_KEY = 'ezop4_ux_v1';
const LAST_VERSION_KEY = 'ezop4_ux_last_version';
const RECAP_KEY = 'ezop4_ux_recap_v1';
const FEEDBACK_KEY = 'ezop4_ux_feedback_v1';

const DEFAULT_STATE: UxState = {
  themeMode: 'auto',
  bigMode: false,
  quietMode: false,
  feedbackCount: 0,
};

const W = window as any;

function loadState(): UxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(patch: Partial<UxState>): UxState {
  const current = loadState();
  const next = { ...current, ...patch };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* quota */ }
  return next;
}

function bridge() {
  return W.__ezopBridge || null;
}

function audit(action: string, detail?: Record<string, unknown>) {
  try {
    const a = W.EZOP4_AUDIT;
    const user = getCurrentUser();
    if (a && typeof a.recordAudit === 'function') {
      a.recordAudit({
        user: user ? { id: user.id || '', name: user.name || user.login || '', role: user.role || 'operator' } : null,
        action,
        entityType: 'ux',
        entityId: getCurrentPage() || 'app',
        summary: detail ? JSON.stringify(detail).slice(0, 200) : action,
      });
    }
  } catch { /* never break UI */ }
}

interface BridgeUser {
  name?: string;
  login?: string;
  role?: string;
  id?: string;
  stationIds?: number[];
}

function getCurrentUser(): BridgeUser | null {
  const b = bridge();
  if (b && typeof b.user === 'function') return b.user() || null;
  return null;
}

function getCurrentPage(): string {
  const b = bridge();
  if (b && typeof b.page === 'function') return b.page() || '';
  return '';
}

function safeToast(msg: string) {
  if (typeof W.showToast === 'function') {
    try { W.showToast(msg, { skipSave: true }); return; } catch { /* fall through */ }
  }
  // fallback do našeho undo toastu
  showUndoToast(msg, null);
}

/* ════════════════════════════════
   THEME APPLICATION
════════════════════════════════ */

function isNightHour(): boolean {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}

function applyTheme(state: UxState = loadState()) {
  const html = document.documentElement;
  const night = state.themeMode === 'night' || (state.themeMode === 'auto' && isNightHour());
  html.classList.toggle('ux-night', night);
  html.classList.toggle('ux-big', state.bigMode);
  html.classList.toggle('ux-quiet', state.quietMode);
}

let themeTick: number | undefined;
function startThemeAutoTicker() {
  if (themeTick) return;
  themeTick = window.setInterval(() => {
    const s = loadState();
    if (s.themeMode === 'auto') applyTheme(s);
  }, 60_000);
}

/* ════════════════════════════════
   PANEL UTILITY
════════════════════════════════ */

interface PanelOptions {
  title: string;
  subtitle?: string;
  body: string;
  foot?: string;
  onMount?: (root: HTMLElement) => void;
}

function openPanel(opts: PanelOptions) {
  closePanel();
  const overlay = document.createElement('div');
  overlay.className = 'ux-panel-overlay show';
  overlay.id = 'ux-panel-overlay';
  overlay.innerHTML = `
    <div class="ux-panel" role="dialog" aria-modal="true">
      <div class="ux-panel-head">
        <h2>${opts.title}${opts.subtitle ? `<small>${opts.subtitle}</small>` : ''}</h2>
        <button class="ux-panel-close" aria-label="Zavřít" data-ux-close>✕</button>
      </div>
      <div class="ux-panel-body">${opts.body}</div>
      ${opts.foot ? `<div class="ux-panel-foot">${opts.foot}</div>` : ''}
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePanel();
    const t = e.target as HTMLElement;
    if (t && t.hasAttribute('data-ux-close')) closePanel();
  });
  if (opts.onMount) opts.onMount(overlay);
}

function closePanel() {
  document.getElementById('ux-panel-overlay')?.remove();
}

/* ════════════════════════════════
   SETTINGS PANEL (theme / big / quiet)
════════════════════════════════ */

function openSettingsPanel() {
  const s = loadState();
  const segHtml = (modes: { id: ThemeMode; label: string }[]) =>
    modes.map(m => `<button data-ux-theme="${m.id}" class="${s.themeMode === m.id ? 'active' : ''}">${m.label}</button>`).join('');

  openPanel({
    title: 'Vzhled a komfort',
    subtitle: 'Nastavení pro tvé zařízení — neukládá se do účtu',
    body: `
      <div class="ux-section">
        <h3>Režim zobrazení</h3>
        <div class="ux-segmented" id="ux-theme-seg">
          ${segHtml([
            { id: 'auto',   label: 'Auto (podle hodiny)' },
            { id: 'normal', label: 'Standardní' },
            { id: 'night',  label: 'Noční' },
          ])}
        </div>
        <p style="color:var(--text3);font-size:11px;margin-top:8px;">
          Auto: 18:00–06:00 noční režim, jinak standardní. Vhodné pro noční směny v hale.
        </p>
      </div>
      <div class="ux-section">
        <h3>Velký režim</h3>
        <div class="ux-toggle-row">
          <span>Velká písmena a tlačítka<small>Pro práci v rukavicích nebo ve špatném světle</small></span>
          <div class="ux-switch ${s.bigMode ? 'on' : ''}" data-ux-toggle="bigMode"></div>
        </div>
      </div>
      <div class="ux-section">
        <h3>Tichý režim</h3>
        <div class="ux-toggle-row">
          <span>Vypnout animace a glow<small>Pro starší zařízení a soustředěnou práci</small></span>
          <div class="ux-switch ${s.quietMode ? 'on' : ''}" data-ux-toggle="quietMode"></div>
        </div>
      </div>
      <div class="ux-section">
        <h3>Tisk</h3>
        <button class="ux-btn" id="ux-print-btn">🖨 Vytisknout aktuální stránku</button>
      </div>
    `,
    foot: `<button class="ux-btn primary" data-ux-close>Hotovo</button>`,
    onMount: (root) => {
      root.querySelectorAll<HTMLButtonElement>('#ux-theme-seg button').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.uxTheme as ThemeMode;
          const next = saveState({ themeMode: mode });
          applyTheme(next);
          root.querySelectorAll('#ux-theme-seg button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          audit('ux:theme', { mode });
        });
      });
      root.querySelectorAll<HTMLElement>('[data-ux-toggle]').forEach(el => {
        el.addEventListener('click', () => {
          const key = el.dataset.uxToggle as keyof UxState;
          const current = loadState();
          const value = !(current as any)[key];
          const next = saveState({ [key]: value } as Partial<UxState>);
          applyTheme(next);
          el.classList.toggle('on', value);
          audit('ux:toggle', { key, value });
        });
      });
      root.querySelector('#ux-print-btn')?.addEventListener('click', () => window.print());
    },
  });
}

/* ════════════════════════════════
   "MŮJ DEN" PANEL (operátor)
════════════════════════════════ */

function greetingPart(): string {
  const h = new Date().getHours();
  if (h < 10) return 'Dobré ráno';
  if (h < 14) return 'Dobrý den';
  if (h < 18) return 'Dobré odpoledne';
  return 'Dobrý večer';
}

function shiftLabel(): string {
  const h = new Date().getHours();
  if (h >= 6 && h < 14) return 'Ranní směna';
  if (h >= 14 && h < 22) return 'Odpolední směna';
  return 'Noční směna';
}

function operatorStats() {
  const b = bridge();
  const user = getCurrentUser();
  const result = {
    queueCount: 0,
    activeOrders: 0,
    blockedOrders: 0,
    issuesMine: 0,
    stations: [] as string[],
    todayQty: 0,
  };
  if (!b || !user) return result;

  const stationIds: number[] = (user.stationIds || []).map((x: unknown) => Number(x)).filter((x: number) => !isNaN(x));
  const stations: any[] = b.stations() || [];
  const orders: any[] = b.orders() || [];
  const issues: any[] = b.issues() || [];
  const userLogin = String(user.login || '').toLowerCase();

  result.stations = stations
    .filter(st => stationIds.includes(Number(st?.id)))
    .map(st => `${st?.icon || ''} ${st?.name || st?.id || ''}`.trim())
    .filter(Boolean);

  for (const o of orders) {
    const orderStations: any[] = o?.stations || [];
    let inMyStation = false;
    let isActive = false;
    for (const st of orderStations) {
      const stIdNum = Number(st?.stId);
      const mine = stationIds.includes(stIdNum)
        || (st?.workerLogin && userLogin && String(st.workerLogin).toLowerCase() === userLogin);
      if (mine) {
        inMyStation = true;
        if (st.status === 'in_progress' || st.status === 'progress') isActive = true;
        result.todayQty += Number(st?.qtyOk || 0);
      }
    }
    if (inMyStation) {
      result.queueCount++;
      if (isActive) result.activeOrders++;
      if (o.blocked) result.blockedOrders++;
    }
  }

  result.issuesMine = issues.filter(i => !i.resolved && (
    (i.assignedToLogin && userLogin && String(i.assignedToLogin).toLowerCase() === userLogin) ||
    (i.reportedBy && userLogin && String(i.reportedBy).toLowerCase() === userLogin) ||
    (i.createdByLogin && userLogin && String(i.createdByLogin).toLowerCase() === userLogin)
  )).length;

  return result;
}

function openMyDayPanel() {
  const user = getCurrentUser();
  if (!user) { safeToast('Nejprve se přihlas'); return; }

  const stats = operatorStats();
  const stationsText = stats.stations.length ? stats.stations.join(', ') : 'zatím nepřiřazeno';

  openPanel({
    title: 'Můj den',
    subtitle: `${shiftLabel()} · ${new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    body: `
      <div class="ux-greet">${greetingPart()}, <em>${user.name || user.login || ''}</em>.</div>
      <div class="ux-sub">Tvoje stanoviště: <b style="color:var(--text)">${stationsText}</b></div>

      <div class="ux-tiles">
        <div class="ux-tile"><b>${stats.queueCount}</b><span>Ve frontě</span><em>Zakázky v tvém stanovišti</em></div>
        <div class="ux-tile green"><b>${stats.todayQty}</b><span>OK dnes</span><em>Součet ze tvých stanovišť</em></div>
        <div class="ux-tile ${stats.activeOrders > 0 ? 'amber' : ''}"><b>${stats.activeOrders}</b><span>Rozpracované</span></div>
        <div class="ux-tile ${stats.blockedOrders > 0 ? 'red' : ''}"><b>${stats.blockedOrders}</b><span>Blokované</span></div>
      </div>

      <div class="ux-section">
        <h3>Otevřené problémy</h3>
        ${stats.issuesMine > 0
          ? `<p style="color:var(--text2);font-size:13px;">Máš ${stats.issuesMine} otevřených problémů.</p>`
          : `<p style="color:var(--text2);font-size:13px;">Nemáš otevřené problémy — paráda.</p>`}
      </div>

      <div class="ux-actions">
        <button class="ux-btn primary" data-go="workspace">Otevřít moji frontu</button>
        <button class="ux-btn" data-go="issues">Problémy</button>
        <button class="ux-btn teal" id="ux-recap-from-myday">Předat směnu</button>
      </div>
    `,
    foot: `<button class="ux-btn" data-ux-close>Zavřít</button>`,
    onMount: (root) => {
      root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => {
          closePanel();
          if (typeof W.navigateTo === 'function') W.navigateTo(btn.dataset.go);
        });
      });
      root.querySelector('#ux-recap-from-myday')?.addEventListener('click', () => {
        closePanel();
        openShiftRecapPanel();
      });
    },
  });
  audit('ux:my-day-opened');
}

/* ════════════════════════════════
   "RANNÍ BRIEFING" PANEL (vedení)
════════════════════════════════ */

function managementSnapshot() {
  const b = bridge();
  const out = {
    activeOrders: 0,
    blockedOrders: 0,
    openIssues: 0,
    operators: 0,
    todayOk: 0,
    todayScrap: 0,
    todayRepair: 0,
    bottleneck: '' as string,
  };
  if (!b) return out;

  const orders: any[] = b.orders() || [];
  const issues: any[] = b.issues() || [];
  const stations: any[] = b.stations() || [];

  const activeWorkers = new Set<string>();

  for (const o of orders) {
    const sts: any[] = o?.stations || [];
    let isActive = false;
    let isDone = true;
    for (const st of sts) {
      out.todayOk += Number(st?.qtyOk || 0);
      out.todayRepair += Number(st?.qtyRework || st?.qtyRepair || 0);
      out.todayScrap += Number(st?.qtyScrap || 0);
      if (st?.status === 'in_progress' || st?.status === 'progress') isActive = true;
      if (st?.status !== 'completed' && st?.status !== 'skipped') isDone = false;
      if (st?.workerLogin) activeWorkers.add(String(st.workerLogin).toLowerCase());
    }
    if (sts.length === 0) isDone = false;
    if (isActive) out.activeOrders++;
    if (o?.blocked) out.blockedOrders++;
    void isDone;
  }
  out.openIssues = issues.filter(i => !i.resolved).length;
  out.operators = activeWorkers.size;

  // Bottleneck: kolik zakázek čeká nebo právě běží na každém stanovišti
  const load = new Map<number, number>();
  for (const o of orders) {
    if (!o) continue;
    for (const st of (o.stations || [])) {
      const id = Number(st?.stId);
      if (!id) continue;
      if (st?.status === 'completed' || st?.status === 'skipped') continue;
      load.set(id, (load.get(id) || 0) + 1);
    }
  }
  let topLoadId = 0;
  let topLoad = 0;
  for (const [id, count] of load) {
    if (count > topLoad) { topLoadId = id; topLoad = count; }
  }
  if (topLoadId) {
    const stMeta = stations.find((st: any) => Number(st?.id) === topLoadId);
    out.bottleneck = `${stMeta?.icon ? stMeta.icon + ' ' : ''}${stMeta?.name || topLoadId} (${topLoad} zakázek)`;
  }
  return out;
}

function openBriefingPanel() {
  const user = getCurrentUser();
  const snap = managementSnapshot();
  const dayLabel = new Date().toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
  const riskTiles: string[] = [];
  if (snap.blockedOrders > 0) riskTiles.push(`<li>${snap.blockedOrders} blokovaných zakázek<small>vyžaduje rozhodnutí</small></li>`);
  if (snap.openIssues > 2) riskTiles.push(`<li>${snap.openIssues} otevřených problémů<small>nad běžnou hladinou</small></li>`);
  if (snap.bottleneck) riskTiles.push(`<li>Nejvíc zatížené: ${snap.bottleneck}<small>kandidát na bottleneck</small></li>`);
  if (snap.todayScrap > snap.todayOk * 0.05 && snap.todayOk > 0) riskTiles.push(`<li>Zmetkovitost ${(snap.todayScrap / snap.todayOk * 100).toFixed(1)} %<small>vyšší než 5 %</small></li>`);

  openPanel({
    title: 'Ranní briefing',
    subtitle: dayLabel,
    body: `
      <div class="ux-greet">${greetingPart()}${user?.name ? `, <em>${user.name}</em>` : ''}.</div>
      <div class="ux-sub">Stav výroby právě teď</div>

      <div class="ux-tiles">
        <div class="ux-tile"><b>${snap.activeOrders}</b><span>Aktivní zakázky</span></div>
        <div class="ux-tile ${snap.blockedOrders > 0 ? 'red' : ''}"><b>${snap.blockedOrders}</b><span>Blokované</span></div>
        <div class="ux-tile green"><b>${snap.todayOk}</b><span>OK kusů</span></div>
        <div class="ux-tile ${snap.todayScrap > 0 ? 'red' : ''}"><b>${snap.todayScrap}</b><span>Zmetků</span></div>
        <div class="ux-tile amber"><b>${snap.todayRepair}</b><span>K opravě</span></div>
        <div class="ux-tile"><b>${snap.operators}</b><span>Lidí na stanovištích</span></div>
      </div>

      <div class="ux-section">
        <h3>Co tě dnes může bolet</h3>
        ${riskTiles.length
          ? `<ul class="ux-list">${riskTiles.join('')}</ul>`
          : `<div class="ux-list empty">Žádná rizika nad běžnou hladinou — krásný start dne.</div>`}
      </div>

      <div class="ux-actions">
        <button class="ux-btn primary" data-go="dashboard">Přehled</button>
        <button class="ux-btn" data-go="kpi">KPI detail</button>
        <button class="ux-btn" data-go="issues">Problémy</button>
      </div>
    `,
    foot: `
      <button class="ux-btn" id="ux-briefing-print">🖨 Vytisknout</button>
      <button class="ux-btn primary" data-ux-close>Hotovo</button>
    `,
    onMount: (root) => {
      root.querySelectorAll<HTMLButtonElement>('[data-go]').forEach(btn => {
        btn.addEventListener('click', () => {
          closePanel();
          if (typeof W.navigateTo === 'function') W.navigateTo(btn.dataset.go);
        });
      });
      root.querySelector('#ux-briefing-print')?.addEventListener('click', () => window.print());
    },
  });
  audit('ux:briefing-opened');
}

/* ════════════════════════════════
   RECAP SMĚNY (předání)
════════════════════════════════ */

interface ShiftRecapEntry {
  at: string;
  userLogin?: string;
  userName?: string;
  mood: '😀' | '🙂' | '😐' | '🙁';
  note: string;
  todayOk: number;
  todayScrap: number;
}

function loadRecaps(): ShiftRecapEntry[] {
  try {
    const raw = localStorage.getItem(RECAP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecap(entry: ShiftRecapEntry) {
  const list = loadRecaps();
  list.unshift(entry);
  while (list.length > 50) list.pop();
  try { localStorage.setItem(RECAP_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

function openShiftRecapPanel() {
  const user = getCurrentUser();
  const stats = user?.role === 'operator' ? operatorStats() : null;
  const snap = !stats ? managementSnapshot() : null;
  const recaps = loadRecaps().slice(0, 3);

  const todayOk = stats ? stats.todayQty : (snap?.todayOk || 0);
  const todayScrap = snap?.todayScrap || 0;

  openPanel({
    title: 'Předání směny',
    subtitle: `${shiftLabel()} · ${new Date().toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })}`,
    body: `
      <div class="ux-greet">Souhrn směny</div>
      <div class="ux-sub">${user?.name || user?.login || 'Operátor'} · ${stats ? (stats.stations.join(', ') || '—') : 'Vedení'}</div>

      <div class="ux-tiles">
        <div class="ux-tile green"><b>${todayOk}</b><span>OK</span></div>
        ${snap ? `<div class="ux-tile red"><b>${todayScrap}</b><span>Zmetků</span></div>` : ''}
        ${stats ? `<div class="ux-tile"><b>${stats.activeOrders}</b><span>Rozpracované</span></div>` : ''}
        <div class="ux-tile"><b>${stats ? stats.issuesMine : (snap?.openIssues || 0)}</b><span>Otevřené problémy</span></div>
      </div>

      <div class="ux-section">
        <h3>Jak to dnes šlo?</h3>
        <div class="ux-rate" id="ux-rate">
          <button data-mood="😀" title="Skvělé">😀</button>
          <button data-mood="🙂" title="Dobré">🙂</button>
          <button data-mood="😐" title="Šlo to">😐</button>
          <button data-mood="🙁" title="Těžké">🙁</button>
        </div>
      </div>

      <div class="ux-section">
        <h3>Poznámka pro další směnu</h3>
        <div class="ux-field">
          <textarea id="ux-recap-note" placeholder="Co se podařilo, co předáváš, co je třeba dořešit…"></textarea>
        </div>
      </div>

      ${recaps.length ? `
      <div class="ux-section">
        <h3>Poslední předání</h3>
        <ul class="ux-list">
          ${recaps.map(r => `<li>
            <div>
              <b>${r.mood} ${r.userName || r.userLogin || ''}</b><br>
              <small>${new Date(r.at).toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })} · OK ${r.todayOk}</small>
            </div>
            <small style="max-width:55%;text-align:right;">${(r.note || '').slice(0, 60)}${(r.note || '').length > 60 ? '…' : ''}</small>
          </li>`).join('')}
        </ul>
      </div>` : ''}
    `,
    foot: `
      <button class="ux-btn" data-ux-close>Zrušit</button>
      <button class="ux-btn primary" id="ux-recap-save">Uložit a předat</button>
    `,
    onMount: (root) => {
      let mood: ShiftRecapEntry['mood'] = '🙂';
      root.querySelectorAll<HTMLButtonElement>('#ux-rate button').forEach(b => {
        b.addEventListener('click', () => {
          root.querySelectorAll('#ux-rate button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          mood = b.dataset.mood as ShiftRecapEntry['mood'];
        });
      });
      // default selection
      root.querySelector<HTMLButtonElement>('#ux-rate button[data-mood="🙂"]')?.classList.add('active');
      root.querySelector('#ux-recap-save')?.addEventListener('click', () => {
        const note = (root.querySelector<HTMLTextAreaElement>('#ux-recap-note')?.value || '').trim();
        const entry: ShiftRecapEntry = {
          at: new Date().toISOString(),
          userLogin: user?.login,
          userName: user?.name,
          mood,
          note,
          todayOk,
          todayScrap,
        };
        saveRecap(entry);
        audit('ux:shift-recap', { mood, hasNote: !!note });
        closePanel();
        safeToast('Směna předána. Díky!');
      });
    },
  });
}

/* ════════════════════════════════
   ZPĚTNÁ VAZBA
════════════════════════════════ */

interface FeedbackEntry {
  at: string;
  userLogin?: string;
  userName?: string;
  role?: string;
  page: string;
  mood: '🙂' | '😐' | '🙁';
  text: string;
}

function saveFeedback(entry: FeedbackEntry) {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const list: FeedbackEntry[] = raw ? JSON.parse(raw) : [];
    list.unshift(entry);
    while (list.length > 100) list.pop();
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
  } catch { /* quota */ }
}

function openFeedbackPanel() {
  const user = getCurrentUser();
  openPanel({
    title: 'Zpětná vazba',
    subtitle: 'Co ti tu vadí nebo chybí? Píšeš to nám.',
    body: `
      <div class="ux-section">
        <h3>Jak se ti dnes pracuje?</h3>
        <div class="ux-rate" id="ux-fb-rate">
          <button data-mood="🙂">🙂</button>
          <button data-mood="😐">😐</button>
          <button data-mood="🙁">🙁</button>
        </div>
      </div>
      <div class="ux-section">
        <h3>Tvoje zpráva</h3>
        <div class="ux-field">
          <textarea id="ux-fb-text" placeholder="Co bys zlepšil(a)? Co tě dnes zdrželo?"></textarea>
        </div>
      </div>
      <p style="color:var(--text3);font-size:11px;">Zpětná vazba se ukládá lokálně do prohlížeče a do auditu. Žádná identifikace mimo tvé přihlášení.</p>
    `,
    foot: `
      <button class="ux-btn" data-ux-close>Zrušit</button>
      <button class="ux-btn primary" id="ux-fb-send">Odeslat</button>
    `,
    onMount: (root) => {
      let mood: FeedbackEntry['mood'] = '🙂';
      root.querySelectorAll<HTMLButtonElement>('#ux-fb-rate button').forEach(b => {
        b.addEventListener('click', () => {
          root.querySelectorAll('#ux-fb-rate button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          mood = b.dataset.mood as FeedbackEntry['mood'];
        });
      });
      root.querySelector<HTMLButtonElement>('#ux-fb-rate button[data-mood="🙂"]')?.classList.add('active');
      root.querySelector('#ux-fb-send')?.addEventListener('click', () => {
        const text = (root.querySelector<HTMLTextAreaElement>('#ux-fb-text')?.value || '').trim();
        if (!text && mood === '🙂') { safeToast('Napiš pár slov, ať víme, co zlepšit'); return; }
        const entry: FeedbackEntry = {
          at: new Date().toISOString(),
          userLogin: user?.login,
          userName: user?.name,
          role: user?.role,
          page: getCurrentPage(),
          mood, text,
        };
        saveFeedback(entry);
        saveState({ feedbackCount: (loadState().feedbackCount || 0) + 1 });
        audit('ux:feedback', { mood, page: entry.page });
        closePanel();
        safeToast('Díky za zpětnou vazbu!');
      });
    },
  });
}

/* ════════════════════════════════
   F1 / KONTEXTOVÁ NÁPOVĚDA
════════════════════════════════ */

const HELP_PAGES: Record<string, { title: string; body: string }> = {
  dashboard: {
    title: 'Přehled',
    body: `
      <p>Hlavní obrazovka s aktuálním stavem výroby.</p>
      <h3>Co tu najdeš</h3>
      <ul>
        <li>KPI dlaždice s denními počty</li>
        <li>Aktuální zakázky a rozpracovaná práce</li>
        <li>Poslední problémy a alerty</li>
      </ul>
      <h3>Klávesy</h3>
      <p><kbd>Ctrl</kbd>+<kbd>K</kbd> rychlé hledání · <kbd>F1</kbd> nápověda · <kbd>?</kbd> nápověda</p>
    `,
  },
  orders: {
    title: 'Zakázky',
    body: `
      <p>Seznam všech výrobních zakázek.</p>
      <ul>
        <li>Kliknutím na řádek otevřeš detail zakázky</li>
        <li>Filtry nad tabulkou zúží výběr</li>
        <li>Tlačítko + (vpravo dole) vytvoří novou zakázku</li>
      </ul>
    `,
  },
  station: {
    title: 'Stanoviště',
    body: `
      <p>Detail jednoho stanoviště a jeho fronty práce.</p>
      <ul>
        <li>Převzetí kusu → start práce → zápis počtů</li>
        <li>Nahlášení problému přes ⚠ tlačítko</li>
        <li>Předání kusu na další stanoviště</li>
      </ul>
    `,
  },
  issues: {
    title: 'Problémy',
    body: `
      <p>Otevřené a vyřešené problémy z výroby.</p>
      <ul>
        <li>Filtr podle stavu, stanoviště a zakázky</li>
        <li>Otevři problém pro detail a řešení</li>
      </ul>
    `,
  },
  kpi: {
    title: 'KPI',
    body: `
      <p>Klíčové ukazatele výkonu.</p>
      <ul>
        <li>Výkon, včasnost, kvalita</li>
        <li>Trendy a srovnání období</li>
        <li>Exporty pro vedení</li>
      </ul>
    `,
  },
  admin: {
    title: 'Administrace',
    body: `
      <p>Správa uživatelů, stanovišť a integrací.</p>
      <ul>
        <li>Uživatelé a role</li>
        <li>Audit log</li>
        <li>Lupa NET, Supabase, AI</li>
      </ul>
    `,
  },
  workspace: {
    title: 'Moje práce',
    body: `
      <p>Co máš teď na práci ty.</p>
      <ul>
        <li>Tvoje stanoviště</li>
        <li>Aktuální kus a fronta</li>
        <li>Předání směny</li>
      </ul>
    `,
  },
  profile: {
    title: 'Můj profil',
    body: `
      <p>Tvoje účet, heslo, nastavení.</p>
    `,
  },
};

function openHelpOverlay() {
  closeHelpOverlay();
  const page = getCurrentPage();
  const meta = HELP_PAGES[page] || { title: 'Nápověda', body: '<p>Pro tuto obrazovku zatím nemáme detailní nápovědu. Použij FAB vpravo dole pro nastavení a zpětnou vazbu.</p>' };
  const overlay = document.createElement('div');
  overlay.className = 'ux-help-overlay show';
  overlay.id = 'ux-help-overlay';
  overlay.innerHTML = `
    <div class="ux-help-box" role="dialog" aria-modal="true">
      <h2>${meta.title}</h2>
      ${meta.body}
      <h3>Klávesové zkratky</h3>
      <ul>
        <li><kbd>F1</kbd> nebo <kbd>?</kbd> — tato nápověda</li>
        <li><kbd>Ctrl</kbd>+<kbd>K</kbd> — globální hledání</li>
        <li><kbd>Esc</kbd> — zavřít okno</li>
      </ul>
      <div style="margin-top:18px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="ux-btn" id="ux-help-feedback">Mám zpětnou vazbu</button>
        <button class="ux-btn primary" data-ux-help-close>Rozumím</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeHelpOverlay();
    const t = e.target as HTMLElement;
    if (t?.hasAttribute('data-ux-help-close')) closeHelpOverlay();
  });
  overlay.querySelector('#ux-help-feedback')?.addEventListener('click', () => {
    closeHelpOverlay();
    openFeedbackPanel();
  });
  audit('ux:help-opened', { page });
}

function closeHelpOverlay() {
  document.getElementById('ux-help-overlay')?.remove();
}

/* ════════════════════════════════
   CO JE NOVÉHO
════════════════════════════════ */

const WHATS_NEW: { version: string; items: string[] } = {
  version: '0.2.0-ux',
  items: [
    'Velký režim a noční režim (auto podle hodiny) — najdeš v FAB vpravo dole.',
    'Můj den / Ranní briefing — rychlý souhrn pro tvou roli.',
    'Předání směny s poznámkou a náladou.',
    'F1 nebo „?" otevře kontextovou nápovědu kdekoliv v aplikaci.',
    'Zpětná vazba jedním kliknutím — ikona 💬 v FAB.',
    'Tichý režim pro starší zařízení a tisk přátelské zobrazení.',
  ],
};

function maybeShowWhatsNew(force = false) {
  const last = localStorage.getItem(LAST_VERSION_KEY);
  if (!force && last === WHATS_NEW.version) return;
  setTimeout(() => {
    closePanel();
    const overlay = document.createElement('div');
    overlay.className = 'ux-panel-overlay show';
    overlay.innerHTML = `
      <div class="ux-panel ux-news-box" role="dialog">
        <div class="ux-panel-head">
          <h2>Co je nového<small>Verze ${WHATS_NEW.version}</small></h2>
          <button class="ux-panel-close" data-ux-news-close>✕</button>
        </div>
        <div class="ux-panel-body">
          <span class="ux-news-version">UX vylepšení</span>
          <p style="color:var(--text2);font-size:13px;margin-bottom:14px;">
            Aplikace má pár nových funkcí, které ti ulehčí každý den. Tady jsou ty hlavní:
          </p>
          <ul class="ux-list">
            ${WHATS_NEW.items.map(i => `<li><span>${i}</span></li>`).join('')}
          </ul>
        </div>
        <div class="ux-panel-foot">
          <button class="ux-btn primary" data-ux-news-close>Beru na vědomí</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (e.target === overlay || t?.hasAttribute('data-ux-news-close')) {
        try { localStorage.setItem(LAST_VERSION_KEY, WHATS_NEW.version); } catch { /* quota */ }
        overlay.remove();
      }
    });
  }, 1500);
}

/* ════════════════════════════════
   IMPERSONATE PŘEHLED (pro admina)
════════════════════════════════ */

const ROLE_DESC: Record<string, { title: string; what: string[]; cant: string[] }> = {
  operator: {
    title: 'Operátor',
    what: [
      'Vidí jen svou frontu práce',
      'Převzetí kusu → start → zápis počtů → předání',
      'Zadání OK / oprava / zmetek',
      'Rychlé nahlášení problému',
      'Skenování QR / kódu zakázky a produktu',
      'Předání směny s poznámkou',
    ],
    cant: [
      'Měnit role a uživatele',
      'Editovat nastavení integrací',
      'Vidět KPI vedení',
    ],
  },
  tpv: {
    title: 'TPV',
    what: [
      'Nastavení postupů a pracovních tras',
      'BOM a materiály',
      'Parametry, kontroly, kritéria',
      'AI souhrn zakázky',
      'Změnové řízení s auditní stopou',
    ],
    cant: [
      'Spravovat uživatele a role',
      'Měnit přístupy ke stanovištím',
    ],
  },
  dispatcher: {
    title: 'Dispečer / mistr',
    what: [
      'Přehled front a vytíženosti',
      'Blokace a priority zakázek',
      'Přesuny mezi stanovišti',
      'Řešení problémů s týmem',
      'Poznámky k výrobku a procesu',
    ],
    cant: [
      'Spravovat globální nastavení Supabase / Auth',
    ],
  },
  management: {
    title: 'Vedení',
    what: [
      'KPI v reálném čase',
      'Výkon, včasnost, kvalita',
      'Trendy problémů a zmetkovitosti',
      'Vytížení linek a lidí',
      'Exporty do Lupa NET',
      'Ranní briefing s riziky',
    ],
    cant: [
      'Spravovat uživatele a role (čte je)',
      'Editovat výrobní data přímo',
    ],
  },
  admin: {
    title: 'Admin',
    what: [
      'Plná správa uživatelů, rolí, stanovišť',
      'Audit log',
      'Nastavení integrací (Supabase, Lupa NET, AI)',
      'Vyzkoušet jako… (tento přehled)',
    ],
    cant: [],
  },
};

function openImpersonatePanel() {
  const user = getCurrentUser();
  if (!user || user.role !== 'admin') {
    safeToast('Tento přehled je dostupný jen pro admina');
    return;
  }
  const roles = Object.keys(ROLE_DESC);
  openPanel({
    title: 'Vyzkoušet jako…',
    subtitle: 'Co která role vidí a co může. Jen čtení.',
    body: `
      <div class="ux-section">
        <h3>Vyber roli</h3>
        <div class="ux-segmented" id="ux-imp-seg">
          ${roles.map((r, i) => `<button data-role="${r}" class="${i === 0 ? 'active' : ''}">${ROLE_DESC[r].title}</button>`).join('')}
        </div>
      </div>
      <div id="ux-imp-detail"></div>
    `,
    foot: `<button class="ux-btn primary" data-ux-close>Zavřít</button>`,
    onMount: (root) => {
      const detail = root.querySelector<HTMLDivElement>('#ux-imp-detail');
      const render = (role: string) => {
        const r = ROLE_DESC[role];
        if (!r || !detail) return;
        detail.innerHTML = `
          <div class="ux-section">
            <h3>${r.title} — co může</h3>
            <ul class="ux-list">${r.what.map(x => `<li>✓ ${x}</li>`).join('')}</ul>
          </div>
          ${r.cant.length ? `
          <div class="ux-section">
            <h3>Co nemůže</h3>
            <ul class="ux-list">${r.cant.map(x => `<li>✕ ${x}</li>`).join('')}</ul>
          </div>` : ''}
        `;
      };
      root.querySelectorAll<HTMLButtonElement>('#ux-imp-seg button').forEach((btn, idx) => {
        btn.addEventListener('click', () => {
          root.querySelectorAll('#ux-imp-seg button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          render(btn.dataset.role || '');
        });
        if (idx === 0) render(btn.dataset.role || '');
      });
    },
  });
  audit('ux:impersonate-view');
}

/* ════════════════════════════════
   UNDO TOAST
════════════════════════════════ */

let undoTimer: number | undefined;

function showUndoToast(msg: string, undo: null | (() => void), durationMs = 5000) {
  document.getElementById('ux-undo-toast')?.remove();
  if (undoTimer) clearTimeout(undoTimer);

  const el = document.createElement('div');
  el.className = 'ux-undo-toast';
  el.id = 'ux-undo-toast';
  el.innerHTML = `
    <div class="ux-undo-msg">${msg}</div>
    ${undo ? `<button data-ux-undo>↶ Zpět</button>` : ''}
    <div class="ux-undo-bar" style="width:100%;"></div>
  `;
  document.body.appendChild(el);
  // animate in
  requestAnimationFrame(() => el.classList.add('show'));

  // animate bar
  const bar = el.querySelector<HTMLDivElement>('.ux-undo-bar');
  if (bar) {
    bar.style.transition = `width ${durationMs}ms linear`;
    requestAnimationFrame(() => { bar.style.width = '0%'; });
  }

  if (undo) {
    el.querySelector('[data-ux-undo]')?.addEventListener('click', () => {
      try { undo(); } catch { /* ignore */ }
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
      audit('ux:undo-used');
    });
  }

  undoTimer = window.setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, durationMs);
}

/* ════════════════════════════════
   FLOATING ACTION BAR
════════════════════════════════ */

function renderFab() {
  document.getElementById('ux-fab')?.remove();
  const user = getCurrentUser();
  if (!user) return; // FAB jen po přihlášení

  const role = user.role || 'operator';
  const fab = document.createElement('div');
  fab.className = 'ux-fab';
  fab.id = 'ux-fab';

  const primaryAction = role === 'management' || role === 'admin'
    ? { id: 'briefing', icon: '📊', label: 'Briefing' }
    : { id: 'myday', icon: '☀', label: 'Můj den' };

  const buttons: { id: string; icon: string; label: string; primary?: boolean }[] = [
    { ...primaryAction, primary: true },
    { id: 'recap', icon: '🔁', label: 'Předat směnu' },
  ];
  if (role === 'admin') buttons.push({ id: 'impersonate', icon: '👁', label: 'Vyzkoušet jako…' });
  buttons.push({ id: 'feedback', icon: '💬', label: 'Zpětná vazba' });
  buttons.push({ id: 'help', icon: '❔', label: 'Nápověda (F1)' });
  buttons.push({ id: 'settings', icon: '✦', label: 'Vzhled' });

  fab.innerHTML = buttons.map(b => `
    <button class="ux-fab-btn" data-fab="${b.id}" ${b.primary ? 'data-primary="1"' : ''} title="${b.label}" aria-label="${b.label}">
      <span>${b.icon}</span>
      <span class="ux-fab-label">${b.label}</span>
    </button>
  `).join('');

  document.body.appendChild(fab);

  fab.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.ux-fab-btn');
    if (!target) return;
    const id = target.dataset.fab;
    switch (id) {
      case 'myday': openMyDayPanel(); break;
      case 'briefing': openBriefingPanel(); break;
      case 'recap': openShiftRecapPanel(); break;
      case 'impersonate': openImpersonatePanel(); break;
      case 'feedback': openFeedbackPanel(); break;
      case 'help': openHelpOverlay(); break;
      case 'settings': openSettingsPanel(); break;
    }
  });
}

/* ════════════════════════════════
   EMPTY STATE BOOSTER (nepovinné enhancement)
════════════════════════════════ */

function installEmptyStateBooster() {
  const observer = new MutationObserver(() => {
    document.querySelectorAll<HTMLElement>('[data-empty-boost]:not([data-empty-boosted])').forEach(el => {
      el.dataset.emptyBoosted = '1';
      const icon = el.dataset.emptyIcon || '○';
      const title = el.dataset.emptyTitle || 'Zatím tu nic není';
      const sub = el.dataset.emptySub || '';
      const action = el.dataset.emptyAction || '';
      const actionLabel = el.dataset.emptyActionLabel || '';
      el.innerHTML = `
        <div class="ux-empty">
          <div class="ux-empty-icon">${icon}</div>
          <div class="ux-empty-title">${title}</div>
          ${sub ? `<div class="ux-empty-sub">${sub}</div>` : ''}
          ${action && actionLabel ? `<button class="ux-btn primary" onclick="${action}">${actionLabel}</button>` : ''}
        </div>
      `;
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* ════════════════════════════════
   ERROR BEAUTIFIER (přátelské hlášky)
════════════════════════════════ */

function installErrorBeautifier() {
  window.addEventListener('error', (e) => {
    const msg = (e.message || '').toLowerCase();
    if (msg.includes('script error')) return;
    if (msg.includes('network') || msg.includes('failed to fetch')) {
      safeToast('Aplikace nemá spojení — zkus to za chvíli.');
    }
  });
  window.addEventListener('unhandledrejection', (e: any) => {
    const r = String(e?.reason || '').toLowerCase();
    if (r.includes('supabase') || r.includes('network') || r.includes('fetch')) {
      safeToast('Cloud nedostupný — pracuji v lokálním režimu.');
    }
  });
}

/* ════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════ */

function installKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isEditable = (() => {
      const t = e.target as HTMLElement;
      if (!t) return false;
      const tag = t.tagName?.toLowerCase();
      return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable;
    })();

    if (e.key === 'F1') {
      e.preventDefault();
      if (document.getElementById('ux-help-overlay')) closeHelpOverlay();
      else openHelpOverlay();
      return;
    }
    if (e.key === '?' && !isEditable) {
      e.preventDefault();
      openHelpOverlay();
      return;
    }
    if (e.key === 'Escape') {
      if (document.getElementById('ux-help-overlay')) { closeHelpOverlay(); return; }
      if (document.getElementById('ux-panel-overlay')) { closePanel(); return; }
    }
  });
}

/* ════════════════════════════════
   PŘIHLÁŠENÍ / ODHLÁŠENÍ HOOKS
════════════════════════════════ */

let lastUserKey = '';
function watchAuth() {
  const tick = () => {
    const u = getCurrentUser();
    const key = u ? `${u.login || ''}|${u.role || ''}` : '';
    if (key !== lastUserKey) {
      lastUserKey = key;
      renderFab();
      if (u) {
        // krátké uvítání po přihlášení
        setTimeout(() => {
          if (loadState().feedbackCount === 0) maybeShowWhatsNew();
          else maybeShowWhatsNew();
        }, 800);
      }
    }
  };
  setInterval(tick, 1500);
  tick();
}

/* ════════════════════════════════
   PUBLIC API
════════════════════════════════ */

export function initUx() {
  const start = () => {
    applyTheme();
    startThemeAutoTicker();
    installKeyboardShortcuts();
    installEmptyStateBooster();
    installErrorBeautifier();
    installPatches();
    watchAuth();
    // vystavit globální API pro případné využití z runtime
    W.EZOP4_UX = {
      openMyDay: openMyDayPanel,
      openBriefing: openBriefingPanel,
      openRecap: openShiftRecapPanel,
      openFeedback: openFeedbackPanel,
      openHelp: openHelpOverlay,
      openSettings: openSettingsPanel,
      openImpersonate: openImpersonatePanel,
      undoToast: showUndoToast,
      showWhatsNew: () => maybeShowWhatsNew(true),
    };
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    queueMicrotask(start);
  }
}

declare global {
  interface Window {
    EZOP4_UX?: {
      openMyDay: () => void;
      openBriefing: () => void;
      openRecap: () => void;
      openFeedback: () => void;
      openHelp: () => void;
      openSettings: () => void;
      openImpersonate: () => void;
      undoToast: (msg: string, undo: null | (() => void), durationMs?: number) => void;
      showWhatsNew: () => void;
    };
  }
}
