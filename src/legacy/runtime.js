// Legacy-compatible runtime extracted from the original VyrobaIS index.html.
// Keep behavior stable here, then migrate feature by feature into typed modules.
// ── PWA: SERVICE WORKER ───────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW reg failed:', err))
  );
}

// PWA install prompt support
let _pwaInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _pwaInstallPrompt = e;
  // Show install button if user is already logged in
  setTimeout(() => {
    if (typeof refreshInstallButton === 'function') refreshInstallButton();
  }, 500);
});
window.addEventListener('appinstalled', () => {
  _pwaInstallPrompt = null;
  if (typeof refreshInstallButton === 'function') refreshInstallButton();
  if (typeof showToast === 'function') showToast('✅ Aplikace nainstalována');
});

function refreshInstallButton() {
  const btn = document.getElementById('tbar-install');
  if (!btn) return;
  btn.style.display = _pwaInstallPrompt ? '' : 'none';
}

async function triggerPwaInstall() {
  if (!_pwaInstallPrompt) {
    showToast('ℹ️ Instalaci spusť z menu prohlížeče');
    return;
  }
  _pwaInstallPrompt.prompt();
  try {
    const { outcome } = await _pwaInstallPrompt.userChoice;
    if (outcome === 'accepted') showToast('📥 Instalace spuštěna…');
  } catch { /* ignore */ }
  _pwaInstallPrompt = null;
  refreshInstallButton();
}

// ── SUPABASE CONFIG ───────────────────────────────────
// Konfiguraci nastavte v Admin → ☁️ Cloud (URL + anon key)
// Když je prázdné, aplikace běží jen s localStorage v prohlížeči.
const DEFAULT_SUPABASE_URL = 'https://fiiaiooxwegrdtlpwqey.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_cT376Yp4F0nnbBeGLbu71Q_6mMLlVFN';
const SUPABASE_URL = localStorage.getItem('vyrobais_supabase_url') || DEFAULT_SUPABASE_URL;
const SUPABASE_KEY = localStorage.getItem('vyrobais_supabase_key') || DEFAULT_SUPABASE_KEY;
const DEFAULTS = window.EZOP_DEFAULTS || {};

function cloneDefault(key) {
  return JSON.parse(JSON.stringify(DEFAULTS[key] ?? null));
}

let db = null;
if (SUPABASE_URL && SUPABASE_KEY && window.supabase) {
  try {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('✅ Supabase připojen:', SUPABASE_URL);
  } catch (e) { console.warn('Supabase init failed:', e); }
}

function ezop4AuthMode() {
  return window.EZOP4_AUTH?.readAuthMode?.() || 'demo';
}

function setEzop4AuthMode(mode) {
  window.EZOP4_AUTH?.writeAuthMode?.(mode === 'supabase' ? 'supabase' : 'demo');
}

// ── PERSISTENCE: localStorage + Supabase ──────────────
const LS_KEY = 'vyrobais_state_v1';
const CLOUD_ROW_ID = 'main';
const SECURITY_VERSION = 2;

function userProfilesForStorage() {
  return USERS.map(({ password, ...profile }) => ({ ...profile }));
}

function localState() {
  return {
    ORDERS, ISSUES, PROD_NOTES,
    USERS: userProfilesForStorage(),
    APP_SETTINGS, NEXT_ORDER_CODE, LOGIN_LOGS, PRODUCT_MEMORY, USER_WORKSPACE, ANNOUNCEMENTS,
    securityVersion: SECURITY_VERSION,
  };
}

function cloudState() {
  return {
    ORDERS, ISSUES, PROD_NOTES,
    APP_SETTINGS, NEXT_ORDER_CODE, PRODUCT_MEMORY, USER_WORKSPACE, ANNOUNCEMENTS, SHIFT_HANDOVERS,
    securityVersion: SECURITY_VERSION,
    securityNote: 'Cloud state intentionally excludes user profiles, credentials and login logs.',
  };
}

function currentState() {
  return localState();
}

function applyState(s, options = {}) {
  if (!s) return;
  if (Array.isArray(s.ORDERS))     ORDERS     = s.ORDERS;
  if (Array.isArray(s.ISSUES))     ISSUES     = s.ISSUES;
  if (Array.isArray(s.PROD_NOTES)) PROD_NOTES = s.PROD_NOTES;
  if (options.includeUsers && Array.isArray(s.USERS) && s.USERS.length) mergeUserProfiles(s.USERS);
  if (options.includeLogs && Array.isArray(s.LOGIN_LOGS)) LOGIN_LOGS = s.LOGIN_LOGS;
  if (s.PRODUCT_MEMORY && typeof s.PRODUCT_MEMORY === 'object') PRODUCT_MEMORY = s.PRODUCT_MEMORY;
  if (s.USER_WORKSPACE && typeof s.USER_WORKSPACE === 'object') USER_WORKSPACE = s.USER_WORKSPACE;
  if (Array.isArray(s.ANNOUNCEMENTS)) ANNOUNCEMENTS = s.ANNOUNCEMENTS;
  if (Array.isArray(s.SHIFT_HANDOVERS)) SHIFT_HANDOVERS = s.SHIFT_HANDOVERS;
  if (s.APP_SETTINGS) APP_SETTINGS = { ...APP_SETTINGS, ...s.APP_SETTINGS };
  if (s.NEXT_ORDER_CODE) NEXT_ORDER_CODE = s.NEXT_ORDER_CODE;
  normalizeAppData();
}

function saveState() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(currentState())); }
  catch (e) { console.warn('LS save failed:', e); }
  markLocalMutation();
  cloudPush();
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function resetState() {
  if (!confirm('Opravdu vymazat všechna lokální data a vrátit demo?')) return;
  localStorage.removeItem(LS_KEY);
  localStorage.removeItem(USER_CREDENTIALS_KEY);
  localStorage.removeItem(LOGIN_GUARD_KEY);
  location.reload();
}

// Cloud sync: jeden řádek s JSONB blobem (jednoduché, postačí pro malou dílnu)
let cloudPushTimer;
let localMutationIgnorePullUntil = 0;

function markLocalMutation() {
  localMutationIgnorePullUntil = Date.now() + 2500;
}

function cloudPush() {
  if (!db) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(async () => {
    try {
      await db.from('app_state')
        .upsert({ id: CLOUD_ROW_ID, data: cloudState(), updated_at: new Date().toISOString() });
    } catch (e) { console.warn('Cloud push failed:', e); }
  }, 800);
}

async function cloudPull() {
  if (!db) return false;
  try {
    const { data, error } = await db.from('app_state')
      .select('data, updated_at').eq('id', CLOUD_ROW_ID).maybeSingle();
    if (error) { console.warn('Cloud pull error:', error); return false; }
    if (data?.data) { applyState(data.data, { includeUsers: false, includeLogs: false }); return true; }
  } catch (e) { console.warn('Cloud pull failed:', e); }
  return false;
}

// Realtime: refresh při změně z jiného zařízení
function startCloudRealtime() {
  if (!db) return;
  db.channel('app_state_ch')
    .on('postgres_changes', { event:'*', schema:'public', table:'app_state' }, async () => {
      if (Date.now() < localMutationIgnorePullUntil) return;
      const ok = await cloudPull();
      if (ok) {
        showToast('🔄 Data synchronizována', { skipSave: true });
        refreshCurrentView();
      }
    })
    .subscribe();
}

// ── USERS ──────────────────────────────────────────────
let USERS = cloneDefault('users') || [];
const ROLE_LABELS = cloneDefault('roleLabels') || {};
const BUILTIN_USER_ROLES = Object.fromEntries(USERS.map(u => [normalizeLogin(u.login), u.role]));
const DEFAULT_DEMO_PASSWORD = '1234';
const USER_CREDENTIALS_KEY = 'vyrobais-creds-v2';

let USER_PASSWORDS = loadUserPasswords();
let USER_WORKSPACE = {};
let ANNOUNCEMENTS = [];
let SHIFT_HANDOVERS = [];

function normalizeLogin(login) {
  return String(login || '').trim().toLowerCase();
}

function normalizeLoginLookup(value) {
  return normalizeLogin(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function resolveLoginUser(login) {
  const key = normalizeLoginLookup(login);
  return USERS.find(user => normalizeLoginLookup(user.login) === key) ||
    USERS.find(user => BUILTIN_USER_ROLES[normalizeLogin(user.login)] && normalizeLoginLookup(user.name) === key) ||
    USERS.find(user => normalizeLoginLookup(user.name) === key);
}

function loadUserPasswords() {
  try {
    const raw = localStorage.getItem(USER_CREDENTIALS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveUserPasswords() {
  try { localStorage.setItem(USER_CREDENTIALS_KEY, JSON.stringify(USER_PASSWORDS)); }
  catch { /* Demo umi bezet i bez localStorage. */ }
}

function passwordForUser(user) {
  const login = normalizeLogin(user?.login);
  return USER_PASSWORDS[login] || DEFAULT_DEMO_PASSWORD;
}

function setUserPassword(login, password) {
  const key = normalizeLogin(login);
  if (!key || !password) return;
  USER_PASSWORDS[key] = String(password);
  saveUserPasswords();
}

function migrateCredentialsFromState(state) {
  if (!Array.isArray(state?.USERS)) return;
  let changed = false;
  state.USERS.forEach(u => {
    const login = normalizeLogin(u?.login);
    if (login && u.password && !USER_PASSWORDS[login]) {
      USER_PASSWORDS[login] = String(u.password);
      changed = true;
    }
    if (u && 'password' in u) delete u.password;
  });
  if (changed) saveUserPasswords();
}

function sanitizeUserProfile(u) {
  const login = normalizeLogin(u?.login);
  if (!login) return null;
  const role = ROLE_LABELS[u.role] ? u.role : 'operator';
  return {
    id: String(u.id || ('u' + Date.now())),
    login,
    role,
    name: String(u.name || login),
    avatar: String(u.avatar || '👤'),
    color: String(u.color || '#6b7280'),
  };
}

function mergeUserProfiles(profiles) {
  profiles.map(sanitizeUserProfile).filter(Boolean).forEach(profile => {
    const lockedRole = BUILTIN_USER_ROLES[profile.login];
    if (lockedRole) profile.role = lockedRole;
    const existing = USERS.find(u => u.id === profile.id || normalizeLogin(u.login) === profile.login);
    if (existing) Object.assign(existing, profile);
    else USERS.push(profile);
  });
}

const STATION_STATUS = {
  waiting:     { label:'Příprava',          badge:'badge-waiting',  action:'reset', icon:'🧰' },
  in_progress: { label:'Rozpracováno',      badge:'badge-progress', action:'start', icon:'▶' },
  partial:     { label:'Částečně hotovo',   badge:'badge-progress', action:'start', icon:'◐' },
  completed:   { label:'Hotovo',            badge:'badge-done',     action:'done',  icon:'✅' },
  issue:       { label:'Problém',           badge:'badge-issue',    action:'issue', icon:'⚠️' },
  skipped:     { label:'Přeskočeno',        badge:'badge-skipped',  action:'reset', icon:'↷' },
};

function stationStatusMeta(status) {
  return STATION_STATUS[status] || STATION_STATUS.waiting;
}

function orderGoodQty(order) {
  return window.EZOP_FLOW?.orderGoodQty(order) ?? 0;
}

function positiveQty(value) {
  return Math.max(0, Number(value) || 0);
}

function stationProcessedQty(station) {
  return positiveQty(station?.qtyOk) + positiveQty(station?.qtyRework) + positiveQty(station?.qtyScrap);
}

function stationReadyQty(station) {
  return stationProcessedQty(station);
}

function stationNonScrapQty(station) {
  return positiveQty(station?.qtyOk) + positiveQty(station?.qtyRework);
}

function stationInputQty(order, station, index) {
  if (!order || !station) return 0;
  if (index <= 0) return positiveQty(order.qty);
  return positiveQty(station.qtyReceived);
}

function syncOrderStationFlow(order) {
  if (!order || !Array.isArray(order.stations)) return false;
  let changed = false;

  order.stations.forEach((station, index) => {
    if (index > 0) {
      const previous = order.stations[index - 1];
      const previousReady = stationReadyQty(previous);
      const previousScrap = positiveQty(previous.qtyScrap);
      if (previousReady > 0 && positiveQty(station.qtyReceived) < previousReady) {
        station.qtyReceived = previousReady;
        changed = true;
      }
      if (previousScrap > positiveQty(station.qtyScrap)) {
        station.qtyScrap = previousScrap;
        changed = true;
      }
    }

    const available = stationInputQty(order, station, index);
    if (station.status === 'completed' && stationNonScrapQty(station) === 0 && available > 0) {
      const autoOk = Math.max(0, available - positiveQty(station.qtyScrap));
      if (positiveQty(station.qtyOk) !== autoOk || positiveQty(station.qtyRework) !== 0) {
        station.qtyOk = autoOk;
        station.qtyRework = 0;
        changed = true;
      }
    }
    const over = stationProcessedQty(station) - available;
    if (available > 0 && over > 0) {
      const okBefore = positiveQty(station.qtyOk);
      const reworkBefore = positiveQty(station.qtyRework);
      station.qtyOk = Math.max(0, okBefore - over);
      const remainingOver = over - (okBefore - station.qtyOk);
      if (remainingOver > 0) station.qtyRework = Math.max(0, reworkBefore - remainingOver);
      console.warn(
        `[syncFlow] Stanice "${station.stId}" zakázky "${order.number}": ` +
        `součet kusů přesahoval dostupné (${available} ks). ` +
        `qtyOk: ${okBefore}→${station.qtyOk}, qtyRework: ${reworkBefore}→${station.qtyRework}`
      );
      changed = true;
    }
  });

  return changed;
}

function stationCardQtyHtml(order, station, index) {
  const processed = stationProcessedQty(station);
  const received = stationInputQty(order, station, index);
  const hasQty = processed > 0 || received > 0;
  if (!hasQty) return '<div style="font-size:11px;color:var(--text3)">Zatím bez kusů</div>';

  return `<div style="display:flex;gap:12px;font-size:11px;flex-wrap:wrap">
    ${received > 0 && index > 0 ? `<span style="color:var(--text2)">Přišlo: ${received}</span>` : ''}
    <span style="color:var(--green)">OK: ${positiveQty(station.qtyOk)}</span>
    <span style="color:var(--amber)">Oprava: ${positiveQty(station.qtyRework)}</span>
    <span style="color:var(--red)">Zmetek: ${positiveQty(station.qtyScrap)}</span>
  </div>`;
}

function priorityRank(priority) {
  return { urgent: 0, high: 1, normal: 2, low: 3 }[priority] ?? 2;
}

function dueTime(order) {
  const time = new Date(order?.due || '').getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function isOrderBlocked(order) {
  return !!order?.blocked?.active;
}

function orderBlockReason(order) {
  return String(order?.blocked?.reason || '').trim();
}

function orderBlockedBadgeHtml(order) {
  if (!isOrderBlocked(order)) return '';
  return `<span class="badge badge-issue" title="${escapeHtml(orderBlockReason(order))}">⛔ Blokace</span>`;
}

function activeStationIndex(order) {
  if (!order?.stations?.length) return -1;
  const active = order.stations.findIndex(s => !['completed','skipped'].includes(s.status));
  return active >= 0 ? active : order.stations.length - 1;
}

function stationQueueState(order, station, index) {
  if (isOrderBlocked(order)) return { label: 'Blokováno', color: 'var(--red)', rank: 0 };
  if (station.status === 'issue') return { label: 'Problém', color: 'var(--red)', rank: 1 };
  if (['in_progress','partial'].includes(station.status)) return { label: 'Rozpracováno', color: 'var(--blue)', rank: 2 };
  if (stationInputQty(order, station, index) > 0 || index === 0) return { label: 'Připraveno', color: 'var(--green)', rank: 3 };
  return { label: 'Čeká na předchozí krok', color: 'var(--amber)', rank: 4 };
}

function workQueueItems(stationId = '') {
  const selectedId = Number(stationId) || 0;
  const rows = [];
  ORDERS.forEach(order => {
    syncOrderStationFlow(order);
    (order.stations || []).forEach((station, index) => {
      if (selectedId && Number(station.stId) !== selectedId) return;
      if (!selectedId && index !== activeStationIndex(order)) return;
      if (['completed','skipped'].includes(station.status) && !isOrderBlocked(order)) return;
      const stInfo = STATIONS.find(st => st.id === Number(station.stId));
      const queueState = stationQueueState(order, station, index);
      rows.push({ order, station, index, stInfo, queueState });
    });
  });
  return rows.sort((a, b) =>
    a.queueState.rank - b.queueState.rank ||
    priorityRank(a.order.priority) - priorityRank(b.order.priority) ||
    dueTime(a.order) - dueTime(b.order) ||
    String(a.order.number).localeCompare(String(b.order.number))
  );
}

function findOrderByCode(rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;
  const normalized = code
    .replace(/^ezop:/i, '')
    .replace(/^zakazka:/i, '')
    .trim();
  const fromUrl = (() => {
    try {
      const url = new URL(normalized, location.origin);
      return url.searchParams.get('order') || url.searchParams.get('code') || url.searchParams.get('qr') || '';
    } catch {
      return '';
    }
  })();
  const needle = (fromUrl || normalized).trim().toLowerCase();
  return ORDERS.find(o =>
    String(o.number || '').toLowerCase() === needle ||
    String(o.id || '').toLowerCase() === needle ||
    String(o.purchaseOrderNumber || '').toLowerCase() === needle
  ) || null;
}

function openOrderByCode(code, options = {}) {
  const order = findOrderByCode(code);
  if (!order) {
    if (!options.silent) showToast('⚠️ Zakázka podle kódu nebyla nalezena');
    return false;
  }
  const stationId = Number(options.station) || 0;
  if (stationId && order.stations?.some(st => Number(st.stId) === stationId)) {
    openStation(order.id, stationId);
  } else {
    openOrder(order.id);
  }
  if (!options.silent) showToast(`📎 Otevřeno: ${order.number}`, { skipSave: true });
  return true;
}

function currentOrderLink(order, stationId = '') {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('order', order.number || order.id);
  if (stationId) url.searchParams.set('station', String(stationId));
  return url.toString();
}

function validStencilNumber(value) {
  return !String(value || '').trim() || /^\d+\/\d{4}$/.test(String(value).trim());
}

function normalizeLegacyStencilNumber(value) {
  const map = {
    'PL-VB300-R3': '3/0001',
    'PL-PM24-001': '3/0002',
    'PL-SR10-R2': '3/0003',
  };
  return map[String(value || '').trim()] || String(value || '').trim();
}

// ── APP SETTINGS (editable by admin) ──────────────────
let APP_SETTINGS = cloneDefault('appSettings') || {};

// ── STATIONS ──────────────────────────────────────────
const STATIONS = cloneDefault('stations') || [];

// ── REPORTED ISSUES (visible to all users) ───────────
let ISSUES = [];   // { id, orderId, stationId, severity, description, reportedBy, reportedAt, resolved }

// ── PRODUCTION NOTES (visible to all users) ──────────
// type: 'info' | 'storage' | 'material' | 'change' | 'other'
let PROD_NOTES = cloneDefault('productionNotes') || [];

// ── DEMO ORDERS ───────────────────────────────────────
// Číslo zakázky = 6místný kód (auto-increment od 261100)
let NEXT_ORDER_CODE = DEFAULTS.nextOrderCode || 261104;
let ORDERS = cloneDefault('orders') || [];

const LOGIN_LOG_KEY = 'vyrobais-login-log-v1';
let LOGIN_LOGS = loadLoginLogs();
let PRODUCT_MEMORY = {};

function autoReadyBase(note) {
  const parts = String(note?.autoKey || '').split(':');
  return parts.length === 5 && parts[0] === 'auto-ready'
    ? parts.slice(0, 4).join(':')
    : '';
}

function autoReadyQty(note) {
  const parts = String(note?.autoKey || '').split(':');
  return Number(parts[4]) || 0;
}

function cleanupAppMemory(options = {}) {
  const before = {
    notes: PROD_NOTES.length,
    logs: LOGIN_LOGS.length,
    memory: Object.keys(PRODUCT_MEMORY || {}).length,
  };

  const autoWinners = new Map();
  PROD_NOTES.forEach(note => {
    const base = autoReadyBase(note);
    if (!base) return;
    const current = autoWinners.get(base);
    const currentTime = current ? new Date(current.createdAt || 0).getTime() : 0;
    const noteTime = new Date(note.createdAt || 0).getTime();
    if (!current || autoReadyQty(note) > autoReadyQty(current) || noteTime > currentTime) {
      autoWinners.set(base, note);
    }
  });

  const seenIds = new Set();
  PROD_NOTES = PROD_NOTES.filter(note => {
    if (seenIds.has(note.id)) return false;
    seenIds.add(note.id);
    const base = autoReadyBase(note);
    return !base || autoWinners.get(base) === note;
  });

  LOGIN_LOGS = LOGIN_LOGS.slice(0, 80);
  PRODUCT_MEMORY = Object.fromEntries(Object.entries(PRODUCT_MEMORY || {}).filter(([, memory]) =>
    memory?.photoDataUrl || Object.keys(memory?.stationPrograms || {}).length > 0
  ));

  if (options.clearLoginGuard) {
    try { localStorage.removeItem(LOGIN_GUARD_KEY); } catch { /* localStorage can be unavailable. */ }
  }

  const stats = {
    removedNotes: before.notes - PROD_NOTES.length,
    removedLogs: before.logs - LOGIN_LOGS.length,
    removedMemory: before.memory - Object.keys(PRODUCT_MEMORY || {}).length,
  };

  if (options.persist) {
    saveLoginLogs();
    saveState();
  }
  return stats;
}

// ── HYDRATE z localStorage (demo data jsou fallback) ─
const _saved = loadState();
if (_saved) {
  migrateCredentialsFromState(_saved);
  applyState(_saved, { includeUsers: true, includeLogs: true });
}
normalizeAppData();
cleanupAppMemory({ persist: false });

// Auto-save při změně stavu
let _saveDebounce;
function autoSave() {
  clearTimeout(_saveDebounce);
  _saveDebounce = setTimeout(saveState, 200);
}

// ── STATE ─────────────────────────────────────────────
let currentUser = null;
let currentAuthSource = 'demo';
let currentPage = 'dashboard';
let detailView = null;
let selectedOrder = null;
let selectedStation = null;

// Numpad state
let numpadValue = '';
let numpadCallback = null;
let numpadField = null;

function loadLoginLogs() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_LOG_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveLoginLogs() {
  try {
    localStorage.setItem(LOGIN_LOG_KEY, JSON.stringify(LOGIN_LOGS.slice(0, 200)));
    localStorage.setItem(LS_KEY, JSON.stringify(currentState()));
  } catch {
    // Staticka demo verze muze bezet i v rezimu bez localStorage.
  }
  cloudPush();
}

function loginSourceDetails() {
  const nav = window.navigator || {};
  const screenInfo = window.screen ? `${window.screen.width}x${window.screen.height}` : `${window.innerWidth}x${window.innerHeight}`;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'nezjisteno';
  return {
    host: window.location.host || 'lokalni soubor',
    url: window.location.href,
    device: nav.platform || 'nezjisteno',
    browser: nav.userAgent || 'nezjisteno',
    language: nav.language || 'nezjisteno',
    timezone: tz,
    screen: screenInfo,
  };
}

function recordLoginEvent(login, user, success) {
  LOGIN_LOGS.unshift({
    id: 'll' + Date.now(),
    at: new Date().toISOString(),
    success,
    login,
    userId: user?.id || null,
    name: user?.name || 'Neznamy uzivatel',
    role: user?.role || null,
    source: loginSourceDetails(),
  });
  LOGIN_LOGS = LOGIN_LOGS.slice(0, 200);
  saveLoginLogs();
}

function cloneForAudit(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return value; }
}

function auditUser() {
  return currentUser
    ? { id: currentUser.id, name: currentUser.name, role: currentUser.role }
    : null;
}

function writeAudit(action, entityType, entityId, summary, before, after) {
  if (!window.EZOP4_AUDIT?.recordAudit) return;
  window.EZOP4_AUDIT.recordAudit({
    user: auditUser(),
    action,
    entityType,
    entityId: String(entityId || ''),
    summary,
    before,
    after,
  }, currentAuthSource === 'supabase' ? db : null);
}

function auditRows() {
  return window.EZOP4_AUDIT?.readAuditLog?.() || [];
}

function clearAuditRows() {
  window.EZOP4_AUDIT?.clearAuditLog?.();
}

function stationAuditId(order, station) {
  return `${order?.id || 'order'}:${station?.stId || 'station'}`;
}

// ── LOGIN / LOGOUT ─────────────────────────────────────
const REMEMBER_USER_KEY = 'vyrobais-remember-user';
const LOGIN_GUARD_KEY = 'vyrobais-login-guard-v1';
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 60 * 1000;

function loadLoginGuard() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOGIN_GUARD_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveLoginGuard(guard) {
  try { localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(guard)); }
  catch { /* Jen lokální ochrana proti rychlému hádání hesla. */ }
}

function loginGuardStatus(login) {
  const key = normalizeLogin(login) || '_empty';
  const guard = loadLoginGuard();
  const entry = guard[key];
  if (!entry?.lockedUntil) return { locked: false, remainingSec: 0 };
  const remaining = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
  if (remaining <= 0) {
    delete guard[key];
    saveLoginGuard(guard);
    return { locked: false, remainingSec: 0 };
  }
  return { locked: true, remainingSec: remaining };
}

function registerLoginFailure(login) {
  const key = normalizeLogin(login) || '_empty';
  const guard = loadLoginGuard();
  const entry = guard[key] || { count: 0, lockedUntil: 0 };
  entry.count = (entry.count || 0) + 1;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    entry.count = 0;
  }
  guard[key] = entry;
  saveLoginGuard(guard);
}

function clearLoginFailures(login) {
  const key = normalizeLogin(login) || '_empty';
  const guard = loadLoginGuard();
  delete guard[key];
  saveLoginGuard(guard);
}

function savedLoginUser() {
  try { return localStorage.getItem(REMEMBER_USER_KEY) || ''; }
  catch { return ''; }
}

function applyRememberedLogin() {
  const saved = savedLoginUser();
  const userInput = document.getElementById('login-user');
  const remember = document.getElementById('remember-user');
  userInput.value = saved;
  remember.checked = !!saved;
  if (saved) document.getElementById('login-pass').focus();
  else userInput.focus();
}

function updateRememberedLogin(login) {
  const remember = document.getElementById('remember-user').checked;
  try {
    if (remember && login) localStorage.setItem(REMEMBER_USER_KEY, login);
    else localStorage.removeItem(REMEMBER_USER_KEY);
  } catch {
    // Zapamatovani je pouze pohodlna lokalni volba v prohlizeci.
  }
}

function completeLogin(user, loginForRemember, authSource) {
  currentUser = user;
  currentAuthSource = authSource || 'demo';
  const lockedRole = currentAuthSource === 'demo' ? BUILTIN_USER_ROLES[normalizeLogin(user.login)] : null;
  if (lockedRole) currentUser.role = lockedRole;
  clearLoginFailures(normalizeLogin(loginForRemember || user.login));
  updateRememberedLogin(user.login);
  recordLoginEvent(user.login, user, true);
  if (authSource === 'demo_fallback') {
    console.warn('[auth] Přihlášení proběhlo přes demo fallback – Supabase Auth nedostupný.');
  }
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('app').style.flexDirection = 'column';
  initApp();
}

async function doLogin() {
  const rawLogin = document.getElementById('login-user').value;
  const u = normalizeLogin(rawLogin);
  const p = document.getElementById('login-pass').value;
  const guard = loginGuardStatus(u);
  if (guard.locked) {
    document.getElementById('login-error').textContent =
      `Příliš mnoho pokusů. Zkuste to znovu za ${guard.remainingSec} s.`;
    return;
  }

  let supabaseError = '';
  if (ezop4AuthMode() === 'supabase') {
    try {
      if (!db) throw new Error('Supabase není připojený.');
      const authPort = window.EZOP4_AUTH?.createSupabaseAuthPort?.(db);
      if (!authPort) throw new Error('Auth modul není načtený.');
      const session = await authPort.signIn(rawLogin, p);
      completeLogin(session.user, rawLogin, 'supabase');
      writeAudit('auth.login', 'user', session.user.id, 'Supabase Auth přihlášení');
      return;
    } catch (error) {
      supabaseError = error?.message || 'Supabase Auth se nezdařil.';
      console.warn('Supabase Auth fallback:', error);
    }
  }

  const found = resolveLoginUser(rawLogin);
  if (!found || passwordForUser(found) !== p) {
    registerLoginFailure(u);
    recordLoginEvent(u || '(prazdne)', null, false);
    document.getElementById('login-error').textContent = supabaseError
      ? `Supabase Auth: ${supabaseError} Demo fallback také neprošel.`
      : 'Nesprávné přihlašovací jméno nebo heslo.';
    return;
  }
  completeLogin(found, rawLogin, supabaseError ? 'demo_fallback' : 'demo');
}

document.getElementById('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
document.getElementById('login-user').addEventListener('keydown', e => { if(e.key==='Enter') document.getElementById('login-pass').focus(); });
document.getElementById('remember-user').addEventListener('change', () => {
  if (!document.getElementById('remember-user').checked) updateRememberedLogin('');
});
applyRememberedLogin();

async function doLogout(options = {}) {
  // Reminder: pokud je uživatel přihlášený na směnu a ještě se neodhlásil,
  // nabídneme rychlý odchod před odhlášením.
  if (!options.skipCheckoutPrompt && currentUser) {
    const rec = todayAttendance();
    if (rec && rec.checkIn && !rec.checkOut) {
      openModal('🕐 Ještě jste se neodhlásil/a ze směny', `
        <div style="font-size:13px;color:var(--text);line-height:1.5">
          Máte otevřený příchod od <b>${formatTime(rec.checkIn)}</b>.
          Chcete zaznamenat odchod předtím, než se odhlásíte z aplikace?
        </div>
      `, [
        { label: '⏭️ Odhlásit bez odchodu', cls: 'btn-ghost',   action: 'doLogout({skipCheckoutPrompt:true})' },
        { label: '🔴 Odchod + odhlásit',    cls: 'btn-primary', action: 'workspaceCheckOut({skipHandoverPrompt:true}); doLogout({skipCheckoutPrompt:true})' },
      ]);
      return;
    }
  }

  if (currentAuthSource === 'supabase') {
    try {
      const authPort = db && window.EZOP4_AUTH?.createSupabaseAuthPort?.(db);
      await authPort?.signOut?.();
    } catch (error) {
      console.warn('Supabase signOut failed:', error);
    }
  }
  closeModal();
  currentUser = null;
  currentAuthSource = 'demo';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-pass').value = '';
  const ind = document.getElementById('tbar-attendance');
  if (ind) ind.style.display = 'none';
  applyRememberedLogin();
}

// ── ROLE PERMISSIONS ──────────────────────────────────
function can(action) {
  const r = BUILTIN_USER_ROLES[normalizeLogin(currentUser?.login)] || currentUser?.role;
  const perms = {
    view_orders:    ['operator','tpv','dispatcher','management','admin'],
    edit_qty:       ['tpv','dispatcher','management','admin'],
    change_status:  ['tpv','dispatcher','management','admin'],
    create_order:   ['dispatcher','management','admin'],
    delete_order:   ['tpv','dispatcher','management','admin'],
    manage_order_stations:['dispatcher','management','admin'],
    edit_order_info:['dispatcher','management','admin'],
    edit_product_memory:['tpv','dispatcher','management','admin'],
    manage_scrap:   ['tpv','dispatcher','management','admin'],
    block_order:    ['tpv','dispatcher','management','admin'],
    view_kpi:       ['dispatcher','management','admin'],
    manage_users:   ['admin'],
    app_settings:   ['admin'],
  };
  return perms[action]?.includes(r) ?? false;
}

// ── INIT ──────────────────────────────────────────────
async function initApp() {
  // Pokud je cloud připojen, stáhneme aktuální stav před prvním renderem
  if (db) {
    const ok = await cloudPull();
    if (ok) console.log('📥 Stav stažen z cloudu');
    startCloudRealtime();
  }

  // Topbar
  document.getElementById('tbar-name').textContent = currentUser.name;
  const rb = document.getElementById('tbar-role');
  rb.textContent = ROLE_LABELS[currentUser.role];
  rb.className = 'role-badge role-' + currentUser.role;

  // Cloud indikátor
  const cb = document.getElementById('tbar-cloud');
  if (db) {
    cb.textContent = '☁️ Cloud';
    cb.style.background = 'rgba(34,197,94,.15)';
    cb.style.color = 'var(--green)';
  } else {
    cb.textContent = '💾 Lokálně';
    cb.style.background = 'rgba(153,153,153,.15)';
    cb.style.color = 'var(--text2)';
  }

  buildNav();

  // Routing z PWA shortcut, QR/deeplink URL parametru nebo rychlého odkazu.
  const params = new URLSearchParams(location.search);
  const target = params.get('go');
  const orderCode = params.get('order') || params.get('code') || params.get('qr');
  const stationCode = params.get('station');
  const validTargets = ['dashboard','orders','queue','issues','workspace','profile','kpi','admin'];
  if (orderCode && openOrderByCode(orderCode, { station: stationCode, silent: true })) {
    // Deeplink otevřel zakázku nebo stanoviště.
  } else {
    navigateTo(validTargets.includes(target) ? target : 'dashboard');
  }

  refreshAttendanceIndicator();
  refreshInstallButton();
  const searchBtn = document.getElementById('tbar-search');
  if (searchBtn) searchBtn.style.display = '';
  setInterval(refreshAttendanceIndicator, 60000);
}

// ── NAVIGATION ────────────────────────────────────────
function getNavItems() {
  const openIssueCount = visibleIssues().filter(i => !i.resolved).length;
  const items = [
    { id:'dashboard', label:'Přehled',  icon:'🏠' },
    { id:'queue',     label:'Fronty',   icon:'🧭' },
    { id:'orders',    label:'Zakázky',  icon:'📋' },
    { id:'issues',    label:'Problémy' + (openIssueCount?` (${openIssueCount})`:''), icon:'⚠️' },
  ];
  if (can('app_settings')) items.push({ id:'admin', label:'Správa',   icon:'⚙️' });
  items.push({ id:'workspace', label:'Můj prostor', icon:'📒' });
  items.push({ id:'profile',   label:'Profil',      icon:'👤' });
  return items;
}

function buildNav() {
  const items = getNavItems();
  const nt = document.getElementById('navtabs');
  const bn = document.getElementById('bottom-nav');
  nt.innerHTML = items.map(i =>
    `<div class="navtab" id="tab-${i.id}" onclick="navigateTo('${i.id}')">
      <span class="tab-icon">${i.icon}</span>${i.label}
    </div>`
  ).join('');
  bn.innerHTML = `<div class="bottom-nav-inner">` +
    items.map(i =>
      `<div class="bn-item" id="bn-${i.id}" onclick="navigateTo('${i.id}')">
        <span class="bn-icon">${i.icon}</span><span>${i.label}</span>
      </div>`
    ).join('') + `</div>`;
}

function navigateTo(page) {
  // Při přechodu pryč ze stránky zakázek (mimo přes showOrdersFiltered) zruš filtr
  if (currentPage === 'orders' && page !== 'orders') orderFilter = null;
  detailView = null;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(t => t.classList.remove('active'));

  currentPage = page;
  let pg = document.getElementById('page-' + page);
  if (!pg && page === 'queue') {
    pg = document.createElement('div');
    pg.className = 'page';
    pg.id = 'page-queue';
    document.querySelector('#app > div[style*="padding-bottom"]')?.appendChild(pg);
  }
  if (pg) pg.classList.add('active');
  const tab = document.getElementById('tab-' + page);
  if (tab) tab.classList.add('active');
  const bn = document.getElementById('bn-' + page);
  if (bn) bn.classList.add('active');

  const renderers = {
    dashboard: renderDashboard,
    queue:     renderWorkQueue,
    orders:    renderOrders,
    issues:    renderIssues,
    kpi:       renderKpi,
    admin:     renderAdmin,
    workspace: renderWorkspace,
    profile:   renderProfile,
  };
  renderers[page]?.();
  refreshAttendanceIndicator();
  buildNav(); // refresh badge counts
  document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + page)?.classList.add('active');
  document.getElementById('bn-' + page)?.classList.add('active');
}

function refreshCurrentView() {
  if (detailView?.type === 'station') {
    openStation(detailView.orderId, detailView.stId, { fromSync: true });
    return;
  }
  if (detailView?.type === 'order') {
    openOrder(detailView.orderId, { fromSync: true });
    return;
  }
  if (currentPage) navigateTo(currentPage);
}

// ── ISSUES PAGE (visible to ALL users) ────────────────
function renderIssues() {
  const issues = visibleIssues();
  const open = issues.filter(i => !i.resolved);
  const closed = issues.filter(i => i.resolved);
  const isManager = ['admin','dispatcher','management'].includes(currentUser.role);

  document.getElementById('page-issues').innerHTML = `
    <div style="padding:12px 0 8px;font-size:16px;font-weight:800;color:var(--gold)">
      ⚠️ Hlášené problémy
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-val" style="color:var(--red)">${open.length}</div>
        <div class="stat-lbl">Aktivní</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--green)">${closed.length}</div>
        <div class="stat-lbl">Vyřešené</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--amber)">${open.filter(i=>i.severity==='high').length}</div>
        <div class="stat-lbl">Vysoká priorita</div>
      </div>
    </div>

    <div class="section-title">Aktivní problémy (${open.length})</div>
    ${open.length === 0
      ? `<div class="card" style="text-align:center;color:var(--text2);padding:30px">
          ✅ Žádné aktivní problémy</div>`
      : open.map(i => issueCardHtml(i, isManager)).join('')}

    ${closed.length > 0 ? `
      <div class="section-title">Vyřešené (${closed.length})</div>
      ${closed.slice(0,5).map(i => issueCardHtml(i, false)).join('')}
    ` : ''}
  `;
}

function issueCardHtml(i, canResolve) {
  const sevColor = { low:'#f59e0b', medium:'#f97316', high:'#ef4444' }[i.severity] || '#999';
  const time = new Date(i.reportedAt);
  const ago  = Math.round((Date.now() - time.getTime()) / 60000);
  const agoTxt = ago < 1 ? 'právě teď' : ago < 60 ? `před ${ago} min` : `před ${Math.round(ago/60)} h`;
  const recipient = issueRecipientLabel(i);

  return `<div class="card" style="border-left:4px solid ${sevColor};${i.resolved?'opacity:.55':''};cursor:pointer" onclick="openIssueTarget('${i.id}')">
    <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:8px">
      <div style="font-size:24px">${i.stationIcon}</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:700;color:var(--text)">${i.stationName}</div>
        <div style="font-size:11px;color:var(--text2)">${i.orderName} · ${i.orderNumber}</div>
        <div style="font-size:10px;color:var(--text3);margin-top:2px">📨 ${escapeHtml(recipient)}</div>
      </div>
      <span class="badge" style="background:${sevColor}22;color:${sevColor}">${sevLabel(i.severity)}</span>
    </div>
    <div style="font-size:13px;color:var(--text);background:var(--card2);padding:10px;border-radius:8px;margin-bottom:8px">
      "${i.description}"
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text2)">
      <div>
        👤 ${i.reportedBy} <span style="color:var(--text3)">·</span> ${agoTxt}
      </div>
      ${i.resolved
        ? `<span style="color:var(--green)">✅ Vyřešil ${i.resolvedBy}</span>`
        : canResolve
          ? `<button class="btn btn-teal btn-sm" onclick="event.stopPropagation();resolveIssue('${i.id}')">✓ Označit vyřešeno</button>`
          : `<span style="color:var(--amber)">⏳ Čeká na vyřešení</span>`
      }
    </div>
  </div>`;
}

function openIssueTarget(issueId) {
  const issue = ISSUES.find(i => i.id === issueId);
  if (!issue) return;
  const order = ORDERS.find(o => o.id === issue.orderId);
  const station = order?.stations.find(s => Number(s.stId) === Number(issue.stationId));
  if (order && station) openStation(order.id, station.stId);
  else if (order) openOrder(order.id);
  else showToast('Zakázka k problému už v aplikaci není.');
}

const ISSUE_DEFAULT_TARGET = 'roles:admin,dispatcher,management';

function issueRecipientOptionsHtml() {
  const roleOptions = [
    [ISSUE_DEFAULT_TARGET, 'Admin + mistr + vedení'],
    ['roles:admin,dispatcher,management,tpv', 'Admin + mistr + vedení + TPV'],
    ['roles:dispatcher', 'Mistr'],
    ['roles:management', 'Vedení'],
    ['roles:tpv', 'TPV'],
    ['roles:admin', 'Admin'],
    ['roles:all', 'Všichni uživatelé'],
  ].map(([value, label]) =>
    `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
  ).join('');

  const users = USERS
    .filter(u => u.id !== currentUser?.id)
    .map(u => {
      const lockedRole = BUILTIN_USER_ROLES[normalizeLogin(u.login)] || u.role;
      const roleLabel = ROLE_LABELS[lockedRole] || lockedRole;
      return `<option value="user:${escapeHtml(u.id)}">${escapeHtml(u.name)} · ${escapeHtml(roleLabel)}</option>`;
    }).join('');

  return `
    <optgroup label="Role a skupiny">${roleOptions}</optgroup>
    ${users ? `<optgroup label="Konkrétní uživatel">${users}</optgroup>` : ''}
  `;
}

function parseIssueTarget(value) {
  const raw = value || ISSUE_DEFAULT_TARGET;
  if (raw === 'roles:all') return { targetScope: 'all', targetLabel: 'všichni uživatelé' };
  if (raw.startsWith('roles:')) {
    const roles = raw.slice(6).split(',').map(r => r.trim()).filter(Boolean);
    return {
      targetScope: 'roles',
      targetRoles: roles,
      targetLabel: roles.map(r => ROLE_LABELS[r] || r).join(', '),
    };
  }
  if (raw.startsWith('user:')) {
    const id = raw.slice(5);
    const user = USERS.find(u => u.id === id);
    if (user) {
      return {
        targetScope: 'user',
        targetUserIds: [user.id],
        targetLogins: [normalizeLogin(user.login)],
        targetLabel: user.name,
      };
    }
  }
  return parseIssueTarget(ISSUE_DEFAULT_TARGET);
}

function issueRecipientLabel(issue) {
  if (issue.targetLabel) return issue.targetLabel;
  if (issue.targetScope === 'all') return 'všichni uživatelé';
  if (Array.isArray(issue.targetUserIds) && issue.targetUserIds.length) {
    return issue.targetUserIds
      .map(id => USERS.find(u => u.id === id)?.name)
      .filter(Boolean)
      .join(', ') || 'konkrétní uživatel';
  }
  if (Array.isArray(issue.targetLogins) && issue.targetLogins.length) {
    return issue.targetLogins
      .map(login => USERS.find(u => normalizeLogin(u.login) === normalizeLogin(login))?.name || login)
      .join(', ');
  }
  if (Array.isArray(issue.targetRoles) && issue.targetRoles.length) {
    return issue.targetRoles.map(r => ROLE_LABELS[r] || r).join(', ');
  }
  return 'všichni uživatelé';
}

function userCanSeeIssue(issue) {
  const login = normalizeLogin(currentUser?.login);
  if (issue.reportedByUserId && issue.reportedByUserId === currentUser?.id) return true;
  if (issue.reportedByLogin && normalizeLogin(issue.reportedByLogin) === login) return true;
  if (!issue.reportedByUserId && !issue.reportedByLogin && issue.reportedBy === currentUser?.name) return true;
  if (issue.targetScope === 'all') return true;
  if (Array.isArray(issue.targetUserIds) && issue.targetUserIds.includes(currentUser?.id)) return true;
  if (Array.isArray(issue.targetLogins) && issue.targetLogins.map(normalizeLogin).includes(login)) return true;
  if (Array.isArray(issue.targetRoles)) return issue.targetRoles.includes(currentUser?.role);
  return true;
}

function visibleIssues() {
  return ISSUES.filter(userCanSeeIssue);
}

// ── DASHBOARD ─────────────────────────────────────────
function renderDashboard() {
  const total = ORDERS.length;
  const inProg = ORDERS.filter(o => o.stations.some(s => ['in_progress','partial'].includes(s.status))).length;
  const issues = ORDERS.filter(o => o.stations.some(s => s.status === 'issue')).length;
  const done   = ORDERS.filter(o => o.stations.every(s => ['completed','skipped'].includes(s.status))).length;
  const urgent = ORDERS.filter(o => o.priority === 'urgent').length;

  document.getElementById('page-dashboard').innerHTML = `
    <div style="padding:16px 0 4px">
      <div style="font-size:20px;font-weight:800;color:var(--gold);margin-bottom:2px">
        Dobrý den, ${escapeHtml(currentUser.name.split(' ')[0])}! 👋
      </div>
      <div style="font-size:12px;color:var(--text2)">
        ${new Date().toLocaleDateString('cs-CZ', {weekday:'long', day:'numeric', month:'long'})}
        &nbsp;·&nbsp; ${escapeHtml(APP_SETTINGS.companyName || '')}
      </div>
    </div>
    <div class="divider"></div>

    ${announcementsBannerHtml()}

    ${shiftHandoverWidgetHtml()}

    ${dashboardWorkspaceWidgetHtml()}

    <div class="stat-grid">
      <div class="stat-card" style="cursor:pointer" onclick="showOrdersFiltered(null)">
        <div class="stat-val">${total}</div>
        <div class="stat-lbl">Zakázek celkem</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="showOrdersFiltered('in_progress')">
        <div class="stat-val" style="color:var(--blue)">${inProg}</div>
        <div class="stat-lbl">Ve výrobě</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="navigateTo('issues')">
        <div class="stat-val" style="color:var(--red)">${visibleIssues().filter(i=>!i.resolved).length || issues}</div>
        <div class="stat-lbl">Problémy</div>
      </div>
      <div class="stat-card" style="cursor:pointer" onclick="showOrdersFiltered('urgent')">
        <div class="stat-val" style="color:var(--amber)">${urgent}</div>
        <div class="stat-lbl">Urgentní</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">⚡ Aktivní zakázky</div>
      ${ORDERS.filter(o => o.stations.some(s => ['in_progress','partial','issue'].includes(s.status))).map(o => {
        const done2 = o.stations.filter(s => s.status === 'completed').length;
        const pct = Math.round(done2 / o.stations.length * 100);
        const hasIssue = o.stations.some(s => s.status === 'issue');
        return `<div style="margin-bottom:14px;cursor:pointer" onclick="openOrder('${o.id}')">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;gap:8px">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
              <span style="font-family:'SF Mono',Menlo,monospace;font-size:13px;font-weight:800;color:var(--gold)">${o.number}</span>
              <span style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.name}</span>
            </div>
            <span class="badge badge-${o.priority}">${priorityLabel(o.priority)}</span>
          </div>
          <div style="font-size:11px;color:var(--teal2);margin-bottom:4px">${o.customer}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div class="progress-bar" style="flex:1">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <span style="font-size:11px;color:var(--text2)">${pct}%</span>
          </div>
          <div style="font-size:11px;color:${hasIssue?'var(--red)':'var(--text2)'}">
            ${hasIssue ? '⚠️ Problém na stanovišti' : `${done2}/${o.stations.length} stanovišť dokončeno`}
          </div>
        </div>`;
      }).join('') || '<div style="color:var(--text2);font-size:13px;text-align:center;padding:20px">Žádné aktivní zakázky</div>'}
    </div>

    ${(() => {
      const openIssues = visibleIssues().filter(i => !i.resolved);
      if (openIssues.length === 0 && issues === 0) return '';
      return `<div class="card" style="border-left:3px solid var(--red);cursor:pointer" onclick="navigateTo('issues')">
        <div class="card-title" style="color:var(--red)">⚠️ Hlášené problémy (${openIssues.length})</div>
        ${openIssues.slice(0,3).map(i => `
          <div style="padding:8px 0;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px">
            <span style="font-size:18px">${i.stationIcon}</span>
            <div style="flex:1">
              <div style="font-size:13px;color:var(--text);font-weight:600">${i.stationName} · ${i.orderName}</div>
              <div style="font-size:11px;color:var(--red)">"${i.description.slice(0,60)}${i.description.length>60?'…':''}"</div>
              <div style="font-size:10px;color:var(--text2);margin-top:2px">👤 ${i.reportedBy}</div>
            </div>
            <span class="badge" style="background:${{low:'#f59e0b',medium:'#f97316',high:'#ef4444'}[i.severity]||'#999'}22;color:${{low:'#f59e0b',medium:'#f97316',high:'#ef4444'}[i.severity]||'#999'}">${sevLabel(i.severity)}</span>
          </div>`).join('')}
        ${openIssues.length > 3 ? `<div style="padding:8px 0;text-align:center;color:var(--gold);font-size:12px">+ ${openIssues.length-3} dalších →</div>` : ''}
      </div>`;
    })()}
  `;
}

// ── WORK QUEUES ───────────────────────────────────────
let queueStationFilter = '';
let queueSearch = '';

function renderWorkQueue() {
  const allItems = workQueueItems(queueStationFilter);
  const q = queueSearch.trim().toLowerCase();
  const list = q
    ? allItems.filter(item => {
      const o = item.order;
      const st = item.stInfo;
      return `${o.number} ${o.name} ${o.customer || ''} ${st?.name || ''}`.toLowerCase().includes(q);
    })
    : allItems;

  document.getElementById('page-queue').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;gap:8px;flex-wrap:wrap">
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--gold)">🧭 Fronty pracovišť</div>
        <div style="font-size:11px;color:var(--text2);margin-top:2px">Řazeno podle blokace, problému, priority a termínu.</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="quickOpenOrderModal()">📎 QR / kód</button>
    </div>

    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div class="input-label">Stanoviště</div>
          <select class="input" id="queue-station" onchange="queueStationFilter=this.value;renderWorkQueue()">
            <option value="">Aktuální krok každé zakázky</option>
            ${STATIONS.map(st => `<option value="${st.id}" ${String(st.id)===String(queueStationFilter)?'selected':''}>${st.icon} ${escapeHtml(st.name)}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="input-label">Hledat ve frontě</div>
          <input class="input" id="queue-search" value="${escapeHtml(queueSearch)}" placeholder="číslo, výrobek, zákazník..."
            oninput="queueSearch=this.value;renderWorkQueue()">
        </div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:8px">
        ${list.length} ${list.length===1?'položka':list.length<5?'položky':'položek'} ve frontě
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val" style="color:var(--red)">${allItems.filter(i=>isOrderBlocked(i.order)).length}</div><div class="stat-lbl">Blokace</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--amber)">${allItems.filter(i=>i.order.priority==='urgent').length}</div><div class="stat-lbl">Urgentní</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--green)">${allItems.filter(i=>i.queueState.label==='Připraveno').length}</div><div class="stat-lbl">Připraveno</div></div>
    </div>

    <div id="queue-list">
      ${list.length ? list.map(queueCardHtml).join('') : `<div class="card" style="text-align:center;color:var(--text2);padding:28px">Fronta je prázdná.</div>`}
    </div>
  `;
}

function queueCardHtml(item) {
  const { order, station, index, stInfo, queueState } = item;
  const meta = stationStatusMeta(station.status);
  const link = currentOrderLink(order, station.stId);
  const blockReason = orderBlockReason(order);
  return `<div class="card" style="margin-bottom:8px;border-left:4px solid ${queueState.color};${isOrderBlocked(order)?'background:rgba(239,68,68,.08)':''}">
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="font-size:26px;line-height:1">${stInfo?.icon || '🔧'}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">
          <span style="font-family:'SF Mono',Menlo,monospace;font-size:13px;font-weight:900;color:var(--gold)">${escapeHtml(order.number)}</span>
          <span class="badge badge-${order.priority}">${priorityLabel(order.priority)}</span>
          ${orderBlockedBadgeHtml(order)}
          <span class="badge ${meta.badge}">${meta.label}</span>
        </div>
        <div style="font-size:14px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(order.name)}</div>
        <div style="font-size:11px;color:var(--teal2);margin:2px 0 6px">${escapeHtml(order.customer || '')} · ${escapeHtml(stInfo?.name || 'Stanoviště')} · ${escapeHtml(queueState.label)}</div>
        ${stationCardQtyHtml(order, station, index)}
        ${blockReason ? `<div style="font-size:11px;color:var(--red);margin-top:6px">⛔ ${escapeHtml(blockReason)}</div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
          <button class="btn btn-primary btn-sm" onclick="openStation('${order.id}', '${station.stId}')">Otevřít stanoviště</button>
          <button class="btn btn-ghost btn-sm" onclick="openOrder('${order.id}')">Detail zakázky</button>
          <button class="btn btn-ghost btn-sm" onclick="copyTextToClipboard('${escapeHtml(link)}')">Kopírovat QR odkaz</button>
        </div>
      </div>
    </div>
  </div>`;
}

function quickOpenOrderModal() {
  openModal('📎 Rychlé otevření zakázky', `
    <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">
      Naskenujte QR/čárový kód do pole, nebo napište číslo zakázky. Podporuje číslo zakázky, ID, číslo objednávky i odkaz s parametrem <b>?order=</b>.
    </div>
    <div class="input-group">
      <div class="input-label">Kód zakázky</div>
      <input class="input" id="qo-code" placeholder="např. 261100" onkeydown="if(event.key==='Enter') submitQuickOpenOrder()">
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Otevřít', action:'submitQuickOpenOrder()', cls:'btn-primary' },
  ]);
  setTimeout(() => document.getElementById('qo-code')?.focus(), 50);
}

function submitQuickOpenOrder() {
  const value = document.getElementById('qo-code')?.value || '';
  if (!openOrderByCode(value)) return;
  closeModal();
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    showToast('📋 Odkaz zkopírován', { skipSave: true });
  } catch {
    showToast('⚠️ Kopírování se nepodařilo', { skipSave: true });
  }
}

// ── ORDERS LIST ───────────────────────────────────────
let orderSearch = '';
let orderFilter = null; // 'in_progress' | 'urgent' | null

function filterOrders(q) {
  let list = [...ORDERS];
  if (orderFilter === 'in_progress') {
    list = list.filter(o => o.stations.some(s => ['in_progress','partial'].includes(s.status)));
  } else if (orderFilter === 'urgent') {
    list = list.filter(o => o.priority === 'urgent');
  }
  if (q) {
    const s = q.toLowerCase().trim();
    list = list.filter(o =>
      o.number.includes(s) ||
      (o.name||'').toLowerCase().includes(s) ||
      (o.customer||'').toLowerCase().includes(s)
    );
  }
  return list.sort((a,b) => a.number.localeCompare(b.number));
}

function showOrdersFiltered(filter) {
  orderFilter = filter;
  orderSearch = '';
  navigateTo('orders');
}

function renderOrders() {
  const list = filterOrders(orderSearch);
  document.getElementById('page-orders').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;gap:8px;flex-wrap:wrap">
      <div style="font-size:16px;font-weight:800;color:var(--gold)">📋 Zakázky</div>
      ${can('create_order') ? `<button class="btn btn-primary btn-sm" onclick="newOrderModal()">+ Nová zakázka</button>` : ''}
    </div>

    <div class="card" style="padding:10px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:16px">🔎</span>
        <input id="ord-search" class="input" style="flex:1" placeholder="Hledat: číslo zakázky (např. 261100), výrobek, zákazník..."
          value="${orderSearch.replace(/"/g,'&quot;')}"
          oninput="orderSearch=this.value;document.getElementById('ord-list').innerHTML=ordersListHtml(filterOrders(orderSearch))">
        ${orderSearch ? `<button class="btn btn-ghost btn-sm" onclick="orderSearch='';renderOrders()">✕</button>`:''}
      </div>
      ${orderFilter ? `
        <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
          <span style="font-size:11px;color:var(--text2)">Filtr:</span>
          <span class="badge ${orderFilter==='urgent'?'badge-urgent':'badge-progress'}" style="display:inline-flex;align-items:center;gap:6px">
            ${orderFilter==='urgent'?'🔥 Urgentní':'⚙️ Ve výrobě'}
            <span style="cursor:pointer;font-weight:900" onclick="orderFilter=null;renderOrders()">✕</span>
          </span>
        </div>` : ''}
      <div style="font-size:11px;color:var(--text3);margin-top:6px">
        ${list.length} ${list.length===1?'zakázka':list.length<5?'zakázky':'zakázek'} ${(orderSearch||orderFilter)?'(filtrováno)':''}
      </div>
    </div>

    <div id="ord-list">${ordersListHtml(list)}</div>
  `;
}

function ordersListHtml(list) {
  if (list.length === 0) {
    return `<div class="card" style="text-align:center;color:var(--text2);padding:30px">
      Žádná zakázka neodpovídá hledání
    </div>`;
  }
  return list.map(o => {
    const done = o.stations.filter(s=>s.status==='completed').length;
    const pct = Math.round(done/o.stations.length*100);
    const hasIssue = o.stations.some(s=>s.status==='issue');
    return `<div class="card" style="cursor:pointer;padding:14px;margin-bottom:8px" onclick="openOrder('${o.id}')">
      <div style="display:flex;align-items:flex-start;gap:12px">
        <div style="background:var(--card2);border:1px solid var(--gold);border-radius:8px;padding:8px 10px;text-align:center;min-width:84px">
          <div style="font-size:9px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:1px">Zakázka</div>
          <div style="font-size:18px;font-weight:800;color:var(--gold);font-family:'SF Mono',Menlo,monospace;letter-spacing:1px">${o.number}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
            <span style="font-size:13px;font-weight:600;color:var(--teal2)">${o.customer}</span>
            <span class="badge badge-${o.priority}">${priorityLabel(o.priority)}</span>
            ${orderBlockedBadgeHtml(o)}
            ${can('delete_order') ? `<button class="btn btn-danger btn-sm" style="margin-left:auto;padding:5px 9px;font-size:11px" onclick="event.stopPropagation();deleteOrderModal('${o.id}')">🗑️</button>` : ''}
          </div>
          <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:6px">${o.name}</div>
          <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text2)">
            <span>📦 ${o.qty} ks</span>
            <span>·</span>
            <span>📅 ${formatDate(o.due)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-top:8px">
            <div class="progress-bar" style="flex:1">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <span style="font-size:10px;color:var(--text2);min-width:30px;text-align:right">${pct}%</span>
          </div>
          ${isOrderBlocked(o) ? `<div style="font-size:10px;color:var(--red);margin-top:4px">⛔ Blokace: ${escapeHtml(orderBlockReason(o))}</div>` : ''}
          ${hasIssue ? '<div style="font-size:10px;color:var(--red);margin-top:4px">⚠️ Problém na stanovišti</div>' : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── ORDER DETAIL ──────────────────────────────────────
function openOrder(orderId, options = {}) {
  selectedOrder = ORDERS.find(o => o.id === orderId);
  if (!selectedOrder) {
    detailView = null;
    if (options.fromSync) navigateTo('orders');
    return;
  }
  if (syncOrderStationFlow(selectedOrder)) saveState();
  detailView = { type: 'order', orderId };

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.navtab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bn-item').forEach(t => t.classList.remove('active'));

  const pg = document.getElementById('page-station');
  pg.classList.add('active');

  const totalOk = orderGoodQty(selectedOrder);
  const doneSt  = selectedOrder.stations.filter(s=>s.status==='completed').length;
  const pct     = Math.round(doneSt / selectedOrder.stations.length * 100);

  pg.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 0 8px;cursor:pointer" onclick="navigateTo('orders')">
      <span style="color:var(--text2);font-size:20px">←</span>
      <span style="font-size:12px;color:var(--text2)">Zpět na zakázky</span>
    </div>
    <div class="card" style="border-left:3px solid var(--gold)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.8px;margin-bottom:2px">Číslo zakázky</div>
          <div style="font-size:26px;font-weight:800;color:var(--gold);font-family:'SF Mono',Menlo,monospace;letter-spacing:2px;margin-bottom:6px">${selectedOrder.number}</div>
          <div style="font-size:13px;font-weight:600;color:var(--teal2)">${selectedOrder.customer}</div>
          <div style="font-size:14px;font-weight:700;color:var(--text)">${selectedOrder.name}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <span class="badge badge-${selectedOrder.priority}">${priorityLabel(selectedOrder.priority)}</span>
          ${orderBlockedBadgeHtml(selectedOrder)}
          <button class="btn btn-ghost btn-sm" onclick="copyTextToClipboard('${escapeHtml(currentOrderLink(selectedOrder))}')">🔗 Odkaz</button>
          ${can('block_order') ? (isOrderBlocked(selectedOrder)
            ? `<button class="btn btn-teal btn-sm" onclick="unblockOrderModal('${selectedOrder.id}')">Odblokovat</button>`
            : `<button class="btn btn-danger btn-sm" onclick="blockOrderModal('${selectedOrder.id}')">Blokovat</button>`) : ''}
          ${can('delete_order') ? `<button class="btn btn-danger btn-sm" onclick="deleteOrderModal('${selectedOrder.id}')">🗑️ Smazat</button>` : ''}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">
        <div style="text-align:center;background:var(--card2);border-radius:8px;padding:8px">
          <div style="font-size:20px;font-weight:800;color:var(--gold)">${selectedOrder.qty}</div>
          <div style="font-size:10px;color:var(--text2)">Objednáno</div>
        </div>
        <div style="text-align:center;background:var(--card2);border-radius:8px;padding:8px">
          <div style="font-size:20px;font-weight:800;color:var(--green)">${totalOk}</div>
          <div style="font-size:10px;color:var(--text2)">OK kusů</div>
        </div>
        <div style="text-align:center;background:var(--card2);border-radius:8px;padding:8px">
          <div style="font-size:20px;font-weight:800;color:var(--teal2)">${pct}%</div>
          <div style="font-size:10px;color:var(--text2)">Dokončeno</div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%"></div>
      </div>
    </div>

    ${orderBlockCardHtml(selectedOrder)}
    ${orderInfoCardHtml(selectedOrder)}
    ${productPhotoCardHtml(selectedOrder)}
    ${orderDocsCardHtml(selectedOrder)}
    ${orderAiCardHtml(selectedOrder)}

    <div style="display:flex;align-items:center;justify-content:space-between;margin:16px 0 8px">
      <div style="font-size:11px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:1px">Stanoviště výroby</div>
      ${can('manage_order_stations') ? `<button class="btn btn-ghost btn-sm" onclick="manageStationsModal('${selectedOrder.id}')">⚙️ Spravovat</button>` : ''}
    </div>
    ${selectedOrder.stations.map((s, index) => {
      const stInfo = STATIONS.find(x => x.id === s.stId);
      const meta = stationStatusMeta(s.status);
      const nCount = stationNotes(selectedOrder.id, s.stId).length;
      return `<div class="card" style="cursor:pointer;margin-bottom:8px" onclick="openStation('${selectedOrder.id}','${s.stId}')">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-size:24px">${stInfo?.icon ?? '🔧'}</div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:6px">
              <span style="font-size:14px;font-weight:700">${stInfo?.name ?? 'Stanoviště'}</span>
              <div style="display:flex;align-items:center;gap:6px">
                ${nCount ? `<span style="font-size:10px;color:var(--teal2);background:rgba(34,184,158,.15);padding:2px 7px;border-radius:10px">📝 ${nCount}</span>` : ''}
                <span class="badge ${meta.badge}">${meta.label}</span>
              </div>
            </div>
            ${stationCardQtyHtml(selectedOrder, s, index)}
          </div>
          <span style="color:var(--text3)">›</span>
        </div>
      </div>`;
    }).join('')}
  `;
}

function orderInfoCardHtml(o) {
  const pt = PROD_TYPES[o.productionType] || PROD_TYPES.new;
  const techColor = o.technology === 'olovo' ? '#a16207' : '#d4a017';
  const techLabel = o.technology === 'olovo' ? '🔧 OLOVO' : '⚡ BEZOLOVO';
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div class="card-title" style="margin:0">📋 Údaje o zakázce</div>
      ${can('edit_order_info') ? `<button class="btn btn-ghost btn-sm" onclick="editOrderInfoModal('${o.id}')">✏️ Upravit</button>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Číslo objednávky</div>
        <div style="font-size:13px;color:${o.purchaseOrderNumber ? 'var(--gold)' : 'var(--text3)'};font-weight:700;font-family:'SF Mono',Menlo,monospace;margin-top:2px">${escapeHtml(o.purchaseOrderNumber || '—')}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Datum objednání</div>
        <div style="font-size:13px;color:var(--text);font-weight:600;margin-top:2px">${formatDate(o.orderDate || '')}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Termín dodání</div>
        <div style="font-size:13px;color:var(--text);font-weight:600;margin-top:2px">${formatDate(o.due || '')}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Technologie</div>
        <div style="font-size:13px;color:${techColor};font-weight:700;margin-top:2px">${techLabel}</div>
      </div>
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Typ výroby</div>
        <div style="font-size:13px;color:${pt.color};font-weight:700;margin-top:2px">${pt.icon} ${pt.label}</div>
      </div>
      ${o.stencilNumber ? `<div style="grid-column:span 2">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Číslo planžety</div>
        <div style="font-size:13px;color:var(--gold);font-weight:700;font-family:'SF Mono',Menlo,monospace;margin-top:2px">${escapeHtml(o.stencilNumber)}</div>
      </div>` : ''}
    </div>
  </div>`;
}

function orderBlockCardHtml(order) {
  if (!isOrderBlocked(order)) return '';
  const block = order.blocked || {};
  return `<div class="card" style="border-left:4px solid var(--red);background:rgba(239,68,68,.10)">
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
      <div>
        <div class="card-title" style="color:var(--red);margin-bottom:6px">⛔ Zakázka je blokovaná</div>
        <div style="font-size:13px;color:var(--text);line-height:1.45">${escapeHtml(block.reason || 'Bez důvodu')}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:6px">
          ${escapeHtml(block.byName || 'Neznámý uživatel')} · ${formatDateTime(block.at)}
        </div>
      </div>
      ${can('block_order') ? `<button class="btn btn-teal btn-sm" onclick="unblockOrderModal('${order.id}')">Odblokovat</button>` : ''}
    </div>
  </div>`;
}

function blockOrderModal(orderId) {
  if (!can('block_order')) {
    showToast('🚫 Nemáte oprávnění blokovat zakázku.');
    return;
  }
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return;
  openModal('⛔ Blokovat zakázku', `
    <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:800;color:var(--red);margin-bottom:5px">${escapeHtml(order.number)} · ${escapeHtml(order.name)}</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Blokace zastaví ukládání počtů a změny stavu na stanovištích, dokud ji oprávněná role neodblokuje.
      </div>
    </div>
    <div class="input-group">
      <div class="input-label">Důvod blokace *</div>
      <textarea class="input" id="bo-reason" rows="4" placeholder="např. chybí materiál, čeká se na zákazníka, chyba dokumentace"
        style="resize:vertical;min-height:90px;font-family:inherit"></textarea>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Blokovat', action:`submitBlockOrder('${order.id}')`, cls:'btn-danger' },
  ]);
  setTimeout(() => document.getElementById('bo-reason')?.focus(), 50);
}

function submitBlockOrder(orderId) {
  const order = ORDERS.find(o => o.id === orderId);
  if (!order || !can('block_order')) return;
  const reason = document.getElementById('bo-reason')?.value.trim() || '';
  if (!reason) {
    showToast('⚠️ Vyplňte důvod blokace.');
    return;
  }
  const before = cloneForAudit(order);
  order.blocked = {
    active: true,
    reason,
    byUserId: currentUser.id,
    byLogin: currentUser.login,
    byName: currentUser.name,
    byRole: currentUser.role,
    at: new Date().toISOString(),
  };
  PROD_NOTES.unshift({
    id: 'pn-block-' + Date.now(),
    orderId: order.id,
    stationId: order.stations?.[activeStationIndex(order)]?.stId || order.stations?.[0]?.stId || 0,
    targetScope: 'all',
    type: 'change',
    text: `Zakázka blokována: ${reason}`,
    author: currentUser.name,
    authorUserId: currentUser.id,
    authorLogin: currentUser.login,
    authorRole: currentUser.role,
    createdAt: new Date().toISOString(),
  });
  writeAudit('order.blocked', 'order', order.id, `${order.number} · zakázka blokována`, before, cloneForAudit(order));
  closeModal();
  saveState();
  if (selectedOrder?.id === order.id) openOrder(order.id);
  else refreshCurrentView();
  showToast('⛔ Zakázka blokována', { skipSave: true });
}

function unblockOrderModal(orderId) {
  if (!can('block_order')) {
    showToast('🚫 Nemáte oprávnění odblokovat zakázku.');
    return;
  }
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return;
  openModal('✅ Odblokovat zakázku', `
    <div style="font-size:13px;color:var(--text2);line-height:1.5;margin-bottom:12px">
      Zakázka <b style="color:var(--text)">${escapeHtml(order.number)} · ${escapeHtml(order.name)}</b> bude znovu uvolněna do výroby.
    </div>
    <div class="input-group">
      <div class="input-label">Důvod odblokování *</div>
      <textarea class="input" id="ubo-reason" rows="4" placeholder="např. materiál doplněn, dokumentace opravena, zákazník schválil pokračování"
        style="resize:vertical;min-height:90px;font-family:inherit"></textarea>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Odblokovat', action:`submitUnblockOrder('${order.id}')`, cls:'btn-primary' },
  ]);
  setTimeout(() => document.getElementById('ubo-reason')?.focus(), 50);
}

function submitUnblockOrder(orderId) {
  const order = ORDERS.find(o => o.id === orderId);
  if (!order || !can('block_order')) return;
  const reason = document.getElementById('ubo-reason')?.value.trim() || '';
  if (!reason) {
    showToast('⚠️ Vyplňte důvod odblokování.');
    return;
  }
  const before = cloneForAudit(order);
  order.blocked = {
    ...(order.blocked || {}),
    active: false,
    resolvedReason: reason,
    resolvedByUserId: currentUser.id,
    resolvedByLogin: currentUser.login,
    resolvedByName: currentUser.name,
    resolvedByRole: currentUser.role,
    resolvedAt: new Date().toISOString(),
  };
  PROD_NOTES.unshift({
    id: 'pn-unblock-' + Date.now(),
    orderId: order.id,
    stationId: order.stations?.[activeStationIndex(order)]?.stId || order.stations?.[0]?.stId || 0,
    targetScope: 'all',
    type: 'change',
    text: `Zakázka odblokována: ${reason}`,
    author: currentUser.name,
    authorUserId: currentUser.id,
    authorLogin: currentUser.login,
    authorRole: currentUser.role,
    createdAt: new Date().toISOString(),
  });
  writeAudit('order.unblocked', 'order', order.id, `${order.number} · zakázka odblokována`, before, cloneForAudit(order));
  closeModal();
  saveState();
  if (selectedOrder?.id === order.id) openOrder(order.id);
  else refreshCurrentView();
  showToast('✅ Zakázka odblokována', { skipSave: true });
}

function orderAiCardHtml(o) {
  if (!can('edit_order_info') && !can('view_kpi')) return '';
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div class="card-title" style="margin:0">🤖 AI přehled zakázky</div>
      <button class="btn btn-ghost btn-sm" onclick="generateOrderAiSummary('${o.id}')">Shrnout</button>
    </div>
    <div id="ai-summary-${o.id}" style="font-size:12px;color:var(--text2);line-height:1.55">
      AI přehled je dostupný při spuštění přes vývojový server EZOP4 s nastaveným OPENAI_API_KEY.
    </div>
  </div>`;
}

async function generateOrderAiSummary(orderId) {
  const order = ORDERS.find(o => o.id === orderId);
  const box = document.getElementById(`ai-summary-${orderId}`);
  if (!order || !box) return;
  if (!window.EZOP4_AI?.summarizeOrder) {
    box.innerHTML = 'AI modul není dostupný v této sestavě aplikace.';
    return;
  }

  box.innerHTML = 'Generuji přehled zakázky...';
  try {
    const result = await window.EZOP4_AI.summarizeOrder({
      order,
      issues: ISSUES.filter(issue => issue.orderId === orderId),
      notes: PROD_NOTES.filter(note => note.orderId === orderId),
    });
    box.innerHTML = `
      <div style="font-weight:700;color:var(--text);margin-bottom:8px">${escapeHtml(result.summary || 'Bez shrnutí.')}</div>
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Rizika</div>
      ${(result.risks || []).length ? `<ul style="margin:0 0 10px 18px;padding:0">${result.risks.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div style="margin-bottom:10px">Bez významných rizik.</div>'}
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px">Doporučené kroky</div>
      ${(result.nextSteps || []).length ? `<ul style="margin:0 0 0 18px;padding:0">${result.nextSteps.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div>Bez doporučených kroků.</div>'}
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI přehled se nepodařilo vytvořit.';
    box.innerHTML = `<div style="color:var(--amber);font-weight:700;margin-bottom:4px">AI přehled není dostupný</div>
      <div>${escapeHtml(message)}</div>`;
  }
}

function deleteOrderModal(orderId) {
  if (!can('delete_order')) {
    showToast('🚫 Nemáte oprávnění smazat zakázku.');
    return;
  }
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return;
  const noteCount = PROD_NOTES.filter(n => n.orderId === orderId).length;
  const issueCount = ISSUES.filter(i => i.orderId === orderId).length;
  const stationCount = order.stations?.length || 0;
  openModal('Smazat zakázku', `
    <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:15px;font-weight:800;color:var(--red);margin-bottom:6px">Tato akce je nevratná</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Smaže se zakázka <b style="color:var(--text)">${escapeHtml(order.number)} · ${escapeHtml(order.name)}</b>,
        její stanoviště, poznámky a hlášené problémy.
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val">${stationCount}</div><div class="stat-lbl">Stanovišť</div></div>
      <div class="stat-card"><div class="stat-val">${noteCount}</div><div class="stat-lbl">Poznámek</div></div>
      <div class="stat-card"><div class="stat-val">${issueCount}</div><div class="stat-lbl">Problémů</div></div>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'🗑️ Smazat zakázku', action:`deleteOrder('${orderId}')`, cls:'btn-danger' },
  ]);
}

function deleteOrder(orderId) {
  if (!can('delete_order')) {
    showToast('🚫 Nemáte oprávnění smazat zakázku.');
    return;
  }
  const order = ORDERS.find(o => o.id === orderId);
  if (!order) return;
  const before = cloneForAudit({
    order,
    notes: PROD_NOTES.filter(n => n.orderId === orderId),
    issues: ISSUES.filter(i => i.orderId === orderId),
  });
  const removedNotes = before.notes.length;
  const removedIssues = before.issues.length;
  ORDERS = ORDERS.filter(o => o.id !== orderId);
  PROD_NOTES = PROD_NOTES.filter(n => n.orderId !== orderId);
  ISSUES = ISSUES.filter(i => i.orderId !== orderId);
  if (selectedOrder?.id === orderId) {
    selectedOrder = null;
    selectedStation = null;
    detailView = null;
  }
  writeAudit(
    'order.deleted',
    'order',
    orderId,
    `${order.number} · zakázka smazána`,
    before,
    { removedOrderId: orderId, removedNotes, removedIssues },
  );
  closeModal();
  buildNav();
  autoSave();
  navigateTo('orders');
  showToast(`🗑️ Zakázka ${order.number} smazána`);
}

function productPhotoCardHtml(order, compact = false) {
  const hasPhoto = !!order.productPhotoDataUrl;
  const canEdit = can('edit_product_memory');
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div class="card-title" style="margin:0">📷 Foto výrobku pro opakovanou výrobu</div>
      ${canEdit ? `<label class="btn btn-teal btn-sm" style="cursor:pointer">
        ${hasPhoto ? '↻ Změnit' : '+ Vyfotit'}
        <input type="file" accept="image/*" capture="environment" style="display:none"
          onchange="saveProductPhoto('${order.id}', this.files[0])">
      </label>` : ''}
    </div>
    ${hasPhoto
      ? `<img src="${order.productPhotoDataUrl}" alt="Foto výrobku ${escapeHtml(order.name)}"
          style="width:100%;${compact ? 'max-height:160px' : 'max-height:260px'};object-fit:cover;border-radius:10px;border:1px solid var(--border);background:var(--card2)">`
      : `<div style="border:1px dashed var(--border);border-radius:10px;padding:16px;text-align:center;color:var(--text3);font-size:12px">
          Zatím není uložená fotka výrobku.
        </div>`}
    <div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.4">
      Fotka se uloží k výrobku a u opakované výroby se znovu zobrazí.
    </div>
  </div>`;
}

function stationProgramLabel(stId) {
  if (Number(stId) === 2) return 'Program automatu';
  if (Number(stId) === 3) return 'Program AOI kontroly';
  if (Number(stId) === 6) return 'Program pájení vlnou / selektivní';
  return 'Program / nastavení stanoviště';
}

function stationHasProgram(stId) {
  return [2, 3, 6].includes(Number(stId));
}

function stationProgramCardHtml(order, station, stInfo) {
  if (!stationHasProgram(station.stId)) return '';
  const program = order.stationPrograms?.[station.stId] || '';
  const label = stationProgramLabel(station.stId);
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
      <div class="card-title" style="margin:0">🧠 ${label}</div>
      <span style="font-size:11px;color:var(--text2)">${stInfo?.icon || ''} ${escapeHtml(stInfo?.name || '')}</span>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <input class="input" id="station-program-input" value="${escapeHtml(program)}"
        placeholder="zadejte číslo nebo název programu" ${can('edit_product_memory') ? '' : 'disabled'}
        style="flex:1;margin-bottom:0">
      ${can('edit_product_memory') ? `<button class="btn btn-primary btn-sm" onclick="saveStationProgram()">Uložit</button>` : ''}
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:8px;line-height:1.4">
      Program se uloží k výrobku a při opakované výrobě se znovu předvyplní.
    </div>
  </div>`;
}

function editOrderInfoModal(orderId) {
  if (!can('edit_order_info')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  openModal('Upravit údaje zakázky', `
    <div class="input-group">
      <div class="input-label">Číslo objednávky</div>
      <input class="input" id="eoi-po" value="${escapeHtml(o.purchaseOrderNumber || '')}" placeholder="např. OBJ-2026-001">
    </div>
    <div class="input-group">
      <div class="input-label">Název výrobku</div>
      <input class="input" id="eoi-name" value="${escapeHtml(o.name || '')}">
    </div>
    <div class="input-group">
      <div class="input-label">Zákazník</div>
      <input class="input" id="eoi-customer" value="${escapeHtml(o.customer || '')}">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="input-group">
        <div class="input-label">Počet kusů</div>
        <input class="input" id="eoi-qty" type="number" min="1" value="${Number(o.qty) || 1}">
      </div>
      <div class="input-group">
        <div class="input-label">Priorita</div>
        <select class="input" id="eoi-priority">
          ${['low','normal','high','urgent'].map(p=>`<option value="${p}" ${o.priority===p?'selected':''}>${priorityLabel(p)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="input-group">
        <div class="input-label">Datum objednání</div>
        <input class="input" id="eoi-order-date" type="date" value="${escapeHtml(o.orderDate || '')}">
      </div>
      <div class="input-group">
        <div class="input-label">Termín dodání</div>
        <input class="input" id="eoi-due" type="date" value="${escapeHtml(o.due || '')}">
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="input-group">
        <div class="input-label">Technologie</div>
        <select class="input" id="eoi-tech">
          <option value="bezolovo" ${o.technology !== 'olovo' ? 'selected' : ''}>BEZOLOVO</option>
          <option value="olovo" ${o.technology === 'olovo' ? 'selected' : ''}>OLOVO</option>
        </select>
      </div>
      <div class="input-group">
        <div class="input-label">Typ výroby</div>
        <select class="input" id="eoi-pt">
          ${Object.entries(PROD_TYPES).map(([k,v])=>`<option value="${k}" ${o.productionType===k?'selected':''}>${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="input-group">
      <div class="input-label">Číslo planžety</div>
      <input class="input" id="eoi-stencil" value="${escapeHtml(o.stencilNumber || '')}" placeholder="např. 3/0001" inputmode="numeric" pattern="\\d+/\\d{4}">
      <div style="font-size:10px;color:var(--text3);margin-top:5px">
        Formát: číslo lomítko čtyři číslice, např. 3/0001.
      </div>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Uložit', action:`saveOrderInfo('${orderId}')`, cls:'btn-primary' },
  ]);
}

function saveOrderInfo(orderId) {
  if (!can('edit_order_info')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  const before = cloneForAudit(o);
  const stencil = document.getElementById('eoi-stencil').value.trim();
  if (!validStencilNumber(stencil)) {
    showToast('⚠️ Číslo planžety musí být ve formátu 3/0001');
    return;
  }
  o.purchaseOrderNumber = document.getElementById('eoi-po').value.trim();
  o.name = document.getElementById('eoi-name').value.trim() || o.name;
  o.customer = document.getElementById('eoi-customer').value.trim() || o.customer;
  o.qty = Math.max(1, Number(document.getElementById('eoi-qty').value) || 1);
  o.priority = document.getElementById('eoi-priority').value;
  o.orderDate = document.getElementById('eoi-order-date').value || '';
  o.due = document.getElementById('eoi-due').value || '';
  o.technology = document.getElementById('eoi-tech').value;
  o.productionType = document.getElementById('eoi-pt').value;
  o.stencilNumber = stencil;
  applyProductMemoryToOrder(o);
  updateProductMemory(o);
  writeAudit(
    'order.info_updated',
    'order',
    o.id,
    `${o.number} · údaje zakázky upraveny`,
    before,
    cloneForAudit(o)
  );
  closeModal();
  openOrder(orderId);
  showToast('✅ Údaje zakázky uloženy');
}

function saveStationProgram() {
  if (!selectedOrder || !selectedStation || !can('edit_product_memory') || !stationHasProgram(selectedStation.stId)) return;
  const before = cloneForAudit(selectedOrder.stationPrograms || {});
  const value = document.getElementById('station-program-input').value.trim();
  selectedOrder.stationPrograms = selectedOrder.stationPrograms || {};
  if (value) selectedOrder.stationPrograms[selectedStation.stId] = value;
  else delete selectedOrder.stationPrograms[selectedStation.stId];
  updateProductMemory(selectedOrder);
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  writeAudit(
    'station.program_updated',
    'order_station',
    stationAuditId(selectedOrder, selectedStation),
    `${selectedOrder.number} · ${stInfo?.name || selectedStation.stId}: program ${value || 'smazán'}`,
    before,
    cloneForAudit(selectedOrder.stationPrograms || {})
  );
  showToast('✅ Program uložen k výrobku');
}

async function saveProductPhoto(orderId, file) {
  if (!file || !can('edit_product_memory')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  try {
    o.productPhotoDataUrl = await compressImageFile(file);
    updateProductMemory(o);
    if (detailView?.type === 'station') {
      const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
      renderStationDetail(stInfo);
    } else {
      openOrder(orderId);
    }
    showToast('✅ Fotka výrobku uložena');
  } catch (e) {
    console.warn('Photo save failed:', e);
    showToast('⚠️ Fotku se nepodařilo uložit');
  }
}

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const max = 900;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function orderDocsCardHtml(o) {
  const docs = o.documents || [];
  return `<div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="card-title" style="margin:0">📎 Dokumenty (${docs.length})</div>
      ${can('create_order') ? `<button class="btn btn-teal btn-sm" onclick="addDocToOrder('${o.id}')">+ Nahrát</button>` : ''}
    </div>
    ${docs.length === 0
      ? `<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px 0">Žádné dokumenty</div>`
      : docs.map((d,i) => `
        <div style="display:flex;align-items:center;gap:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px">
          <span style="font-size:18px">${docIcon(d.type)}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.name)}</div>
            <div style="font-size:10px;color:var(--text2)">${docTypeLabel(d.type)} · ${(d.size/1024).toFixed(0)} kB</div>
          </div>
          ${can('create_order')
            ? `<button class="btn btn-ghost btn-sm" onclick="removeDoc('${o.id}',${i})">🗑️</button>` : ''}
        </div>
      `).join('')}
  </div>`;
}

function addDocToOrder(orderId) {
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  openModal('Nahrát dokument', `
    <div class="input-group">
      <div class="input-label">Typ dokumentu</div>
      <select class="input" id="ad-type">
        <option value="bom">📊 BOM</option>
        <option value="drawing">📐 Osazovací výkres</option>
        <option value="paste">🎯 GBR data pasty</option>
        <option value="other">📄 Ostatní</option>
      </select>
    </div>
    <div class="input-group">
      <div class="input-label">Soubor</div>
      <input type="file" id="ad-file" class="input" style="padding:8px"
        accept=".pdf,.xlsx,.xls,.csv,.zip,.gbr,.gbx,.txt,.docx,.dwg,image/*">
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Nahrát', action:`saveDocToOrder('${orderId}')`, cls:'btn-primary' },
  ]);
}

function saveDocToOrder(orderId) {
  const f = document.getElementById('ad-file').files[0];
  if (!f) { showToast('⚠️ Vyberte soubor'); return; }
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  o.documents = o.documents || [];
  o.documents.push({ name:f.name, type:document.getElementById('ad-type').value, size:f.size });
  closeModal();
  openOrder(orderId);
  showToast('✅ Dokument nahrán');
}

function manageStationsModal(orderId) {
  if (!can('manage_order_stations')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  openModal('⚙️ Spravovat stanoviště zakázky', `
    <div style="font-size:12px;color:var(--text2);margin-bottom:12px">
      Zapněte / vypněte stanoviště a určete jejich postupnost. Automatické předání půjde vždy na další aktivní stanoviště v tomto pořadí.
    </div>
    <div id="ms-list">${renderManageStationsList(o)}</div>
    <div style="font-size:10px;color:var(--text3);margin-top:10px">
      💡 Stanoviště, které již má rozpracované kusy, nejde vypnout. Pořadí lze změnit šipkami.
    </div>
  `, [
    { label:'Zavřít', action:'closeModal()', cls:'btn-ghost' },
    { label:'Hotovo', action:`closeModal();openOrder('${orderId}')`, cls:'btn-primary' },
  ]);
}

function renderManageStationsList(o) {
  const activeIds = o.stations.map(s => s.stId);
  const activeRows = o.stations.map((existing, index) => {
    const st = STATIONS.find(x => x.id === existing.stId) || { id:existing.stId, name:'Stanoviště', icon:'🔧' };
    return manageStationRow(o, st, existing, index, activeIds.length);
  }).join('');

  const inactiveRows = STATIONS
    .filter(st => !activeIds.includes(st.id))
    .map(st => manageStationRow(o, st, null, -1, activeIds.length))
    .join('');

  return `
    <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:0 0 6px">
      Aktivní postupnost
    </div>
    ${activeRows || '<div style="font-size:12px;color:var(--text3);padding:10px">Žádná aktivní stanoviště.</div>'}
    ${inactiveRows ? `
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin:12px 0 6px">
        Vypnutá stanoviště
      </div>
      ${inactiveRows}
    ` : ''}
  `;
}

function manageStationRow(o, st, existing, index, activeCount) {
  const sum = existing ? (existing.qtyOk + existing.qtyRework + existing.qtyScrap + existing.qtyReceived) : 0;
  const hasProgress = sum > 0;
  const on = !!existing && existing.status !== 'skipped';
  return `<div style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px 10px;margin-bottom:6px">
      ${on ? `<span style="width:20px;height:20px;border-radius:6px;background:rgba(212,160,23,.14);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800">${index + 1}</span>` : '<span style="width:20px"></span>'}
      <span style="font-size:18px">${st.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600;color:${on?'var(--text)':'var(--text3)'}">${st.name}</span>
      ${hasProgress ? `<span style="font-size:10px;color:var(--text2)">${existing.qtyOk} OK</span>` : ''}
      ${on ? `
        <button class="btn btn-ghost btn-sm" style="padding:5px 8px;opacity:${index === 0 ? '.35' : '1'}" ${index === 0 ? 'disabled' : `onclick="moveOrderStation('${o.id}', ${st.id}, -1)"`}>↑</button>
        <button class="btn btn-ghost btn-sm" style="padding:5px 8px;opacity:${index === activeCount - 1 ? '.35' : '1'}" ${index === activeCount - 1 ? 'disabled' : `onclick="moveOrderStation('${o.id}', ${st.id}, 1)"`}>↓</button>
      ` : ''}
      <div class="toggle ${on?'on':''}" ${hasProgress && on ? 'title="Nelze vypnout – má rozpracované kusy" style="opacity:.4;cursor:not-allowed"' : `onclick="toggleOrderStation('${o.id}', ${st.id})"`}></div>
    </div>`;
}

function toggleOrderStation(orderId, stId) {
  if (!can('manage_order_stations')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  const existing = o.stations.find(s => s.stId === stId);

  if (existing) {
    const sum = existing.qtyOk + existing.qtyRework + existing.qtyScrap + existing.qtyReceived;
    if (sum > 0 && existing.status !== 'skipped') {
      showToast('⚠️ Stanoviště má rozpracované kusy, nelze vypnout');
      return;
    }
    if (existing.status === 'skipped') {
      existing.status = 'waiting';
      showToast('✅ Stanoviště zapnuto');
    } else {
      // odstranit pokud je úplně prázdné, jinak označit jako skipped
      o.stations = o.stations.filter(s => s.stId !== stId);
      showToast('🚫 Stanoviště vypnuto');
    }
  } else {
    o.stations.push({
      stId, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0,
    });
    showToast('➕ Stanoviště přidáno');
  }

  document.getElementById('ms-list').innerHTML = renderManageStationsList(o);
}

function moveOrderStation(orderId, stId, direction) {
  if (!can('manage_order_stations')) return;
  const o = ORDERS.find(x => x.id === orderId);
  if (!o) return;
  const index = o.stations.findIndex(s => s.stId === stId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= o.stations.length) return;
  const [station] = o.stations.splice(index, 1);
  o.stations.splice(target, 0, station);
  document.getElementById('ms-list').innerHTML = renderManageStationsList(o);
  showToast('Pořadí stanovišť změněno');
}

function removeDoc(orderId, idx) {
  const o = ORDERS.find(x => x.id === orderId);
  if (!o || !o.documents) return;
  o.documents.splice(idx, 1);
  openOrder(orderId);
  showToast('🗑️ Dokument odebrán');
}

// ── STATION DETAIL ────────────────────────────────────
function openStation(orderId, stId, options = {}) {
  selectedOrder = ORDERS.find(o => o.id === orderId);
  selectedStation = selectedOrder?.stations.find(s => s.stId === Number(stId));
  if (!selectedOrder || !selectedStation) {
    detailView = null;
    if (options.fromSync) navigateTo('orders');
    return;
  }
  if (syncOrderStationFlow(selectedOrder)) {
    selectedStation = selectedOrder.stations.find(s => s.stId === Number(stId));
    saveState();
  }
  detailView = { type: 'station', orderId, stId: Number(stId) };

  const stInfo = STATIONS.find(x => x.id === Number(stId));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pg = document.getElementById('page-station');
  pg.classList.add('active');

  renderStationDetail(stInfo);
}

function renderStationDetail(stInfo) {
  const s = selectedStation;
  const statusMeta = stationStatusMeta(s.status);

  const pg = document.getElementById('page-station');
  pg.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 0 8px;cursor:pointer"
         onclick="openOrder('${selectedOrder.id}')">
      <span style="color:var(--text2);font-size:20px">←</span>
      <span style="font-size:12px;color:var(--text2)">Zpět na zakázku</span>
    </div>

    <div class="station-header">
      <div class="station-badge">${stInfo?.icon ?? '🔧'}</div>
      <div>
        <div style="font-size:16px;font-weight:800;color:var(--text)">${stInfo?.name ?? 'Stanoviště'}</div>
        <div style="font-size:12px;color:var(--text2)">${selectedOrder.name}</div>
      </div>
      <span class="badge ${statusMeta.badge}" style="margin-left:auto">${statusMeta.label}</span>
    </div>

    ${orderBlockCardHtml(selectedOrder)}

    <!-- QTY -->
    <div class="card">
      <div class="card-title">📦 Počty kusů</div>
      <div class="qty-grid" id="qty-grid">
        ${qtyFieldHtml('ok',     'OK',      s.qtyOk,     'ok-color')}
        ${qtyFieldHtml('rework', 'Oprava',  s.qtyRework, 'rework-color')}
        ${qtyFieldHtml('scrap',  'Zmetek',  s.qtyScrap,  'scrap-color')}
      </div>
      <div id="qty-summary"></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn btn-teal" id="qty-save-btn" style="width:100%" onclick="saveQty()">💾 Uložit počty</button>
      </div>
      ${scrapControlHtml()}
    </div>

    <!-- STATUS ACTIONS -->
    <div class="card">
      <div class="card-title">🔄 Změnit stav</div>
      <div class="action-grid">
        ${stationStatusButton('waiting', '🧰 Příprava')}
        ${stationStatusButton('in_progress', '▶ Rozpracováno')}
        ${stationStatusButton('partial', '◐ Částečně hotovo')}
        ${stationStatusButton('completed', '✅ Hotovo')}
      </div>
      <button class="action-btn issue" style="margin-top:8px;width:100%;justify-content:center" onclick="reportIssueModal()">⚠️ Nahlásit problém</button>
    </div>

    <!-- PRODUCTION NOTES -->
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="card-title" style="margin:0">📝 Poznámky k výrobě (${stationNotes(selectedOrder.id, selectedStation.stId).length})</div>
        <button class="btn btn-teal btn-sm" onclick="addNoteModal()">+ Přidat</button>
      </div>
      ${renderStationNotes()}
    </div>

    ${stationProgramCardHtml(selectedOrder, selectedStation, stInfo)}
    ${productPhotoCardHtml(selectedOrder, true)}
  `;
  updateQtySummary();
}

function stationStatusButton(status, label) {
  const active = selectedStation?.status === status;
  const meta = stationStatusMeta(status);
  return `<button class="action-btn ${meta.action}" onclick="setStatus('${status}')"
    style="${active ? 'border-color:var(--gold);color:var(--gold);background:rgba(212,160,23,.12)' : ''}">
    ${label}
  </button>`;
}

function qtyFieldHtml(field, label, val, colorClass) {
  return `<div class="qty-field" onclick="openNumpad('${field}','${label}',${val})" id="qtf-${field}">
    <div class="qty-field-label" style="color:var(--text2)">${label}</div>
    <div class="qty-field-val ${colorClass}" id="qtv-${field}">${val}</div>
    <div style="font-size:9px;color:var(--text3);margin-top:3px">klikni pro zadání</div>
  </div>`;
}

function scrapControlHtml() {
  const scrap = positiveQty(selectedStation?.qtyScrap);
  if (!scrap) return '';
  const canRemove = can('manage_scrap');
  return `<div style="margin-top:12px;background:rgba(239,68,68,.10);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:10px 12px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:13px;font-weight:800;color:var(--red)">Vadné desky ve zmetku: ${scrap} ks</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">
          Zmetek se automaticky přenáší do dalších stanovišť, dokud ho oprávněná role nevyjme s důvodem.
        </div>
      </div>
      ${canRemove
        ? `<button class="btn btn-danger btn-sm" onclick="removeScrapModal()">Vyjmout ze zmetku</button>`
        : `<span style="font-size:11px;color:var(--text3)">Vyjmout může jen vedení, TPV, mistr nebo admin.</span>`}
    </div>
  </div>`;
}

function qtyAvailable() {
  return window.EZOP_FLOW?.qtyAvailable(selectedOrder, selectedStation) ?? 0;
}

function qtyValidation() {
  return window.EZOP_FLOW?.qtyValidation(selectedOrder, selectedStation) ?? {
    sum: 0, available: 0, exceed: false, remaining: 0,
  };
}

function updateQtySummary() {
  const el = document.getElementById('qty-summary');
  const btn = document.getElementById('qty-save-btn');
  if (!el) return;
  const v = qtyValidation();

  // Highlight červeně každé pole, pokud součet přesahuje
  ['ok','rework','scrap'].forEach(f => {
    const node = document.getElementById('qtf-' + f);
    if (node) node.style.borderColor = v.exceed ? 'var(--red)' : '';
  });

  if (v.exceed) {
    el.innerHTML = `
      <div style="margin-top:12px;background:rgba(239,68,68,.1);border:1px solid var(--red);border-radius:10px;padding:10px 12px">
        <div style="font-size:13px;font-weight:700;color:var(--red);margin-bottom:4px">
          ⛔ Chyba: součet kusů přesahuje vydaný počet ze skladu
        </div>
        <div style="font-size:12px;color:var(--text)">
          Součet <b>OK ${selectedStation.qtyOk} + Oprava ${selectedStation.qtyRework} + Zmetek ${selectedStation.qtyScrap}</b>
          = <b style="color:var(--red)">${v.sum} ks</b>, k dispozici je ale pouze
          <b style="color:var(--gold)">${v.available} ks</b>
          (${selectedStation.qtyReceived > 0 ? 'přišlo z předchozího stanoviště' : 'objednáno do výroby'}).
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:5px">
          ⚠️ Sklad nemůže vydat víc desek – zkontrolujte zadané hodnoty.
        </div>
      </div>`;
    if (btn) {
      btn.style.opacity = '0.4';
      btn.style.cursor = 'not-allowed';
      btn.disabled = true;
    }
  } else {
    el.innerHTML = `
      <div style="margin-top:12px;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between">
        <div style="font-size:12px;color:var(--text2)">
          Součet zpracovaných: <b style="color:var(--text)">${v.sum} ks</b>
          <span style="color:var(--text3)"> / ${v.available} ks ${selectedStation.qtyReceived > 0 ? 'přišlo' : 'objednáno'}</span>
        </div>
        <div style="font-size:12px;color:${v.remaining===0?'var(--green)':'var(--amber)'};font-weight:700">
          ${v.remaining === 0 ? '✅ kompletní' : `zbývá ${v.remaining} ks`}
        </div>
      </div>`;
    if (btn) {
      btn.style.opacity = '';
      btn.style.cursor = '';
      btn.disabled = false;
    }
  }
}

function saveQty() {
  if (!selectedStation) return;
  const result = persistStationCounts();
  if (result?.ok) {
    showToast(result.message || '✅ Počty uloženy');
  }
}

function persistStationCounts(options = {}) {
  if (isOrderBlocked(selectedOrder)) {
    showToast('⛔ Zakázka je blokovaná. Nejdřív ji odblokujte.');
    return { ok: false };
  }
  const before = cloneForAudit(selectedStation);
  const v = qtyValidation();
  if (v.exceed) {
    showToast(`⛔ Nelze uložit: součet ${v.sum} ks > vydáno ${v.available} ks`);
    return { ok: false };
  }
  if (options.forceCompleted) selectedStation.status = 'completed';
  else updateStationStatusFromQty(v);
  const missingCheckMessage = createMissingPreviousCheckAlert();
  const releaseMessage = autoReleaseToNextStation();
  syncOrderStationFlow(selectedOrder);
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  const after = cloneForAudit(selectedStation);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    writeAudit(
      options.forceCompleted ? 'station.completed' : 'station.counts_saved',
      'order_station',
      stationAuditId(selectedOrder, selectedStation),
      `${selectedOrder.number} · ${stInfo?.name || selectedStation.stId}: OK ${selectedStation.qtyOk}, oprava ${selectedStation.qtyRework}, zmetek ${selectedStation.qtyScrap}`,
      before,
      after
    );
  }
  renderStationDetail(stInfo);
  const parts = [options.message || '✅ Počty uloženy', releaseMessage, missingCheckMessage].filter(Boolean);
  return { ok: true, message: parts.join(' ') };
}

function resetQty() {
  if (!selectedStation) return;
  const before = cloneForAudit(selectedStation);
  selectedStation.qtyOk = 0; selectedStation.qtyRework = 0; selectedStation.qtyScrap = 0;
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  writeAudit(
    'station.counts_reset',
    'order_station',
    stationAuditId(selectedOrder, selectedStation),
    `${selectedOrder.number} · ${stInfo?.name || selectedStation.stId}: reset počtů`,
    before,
    cloneForAudit(selectedStation)
  );
  renderStationDetail(stInfo);
}

function removeScrapModal() {
  if (!selectedStation || !selectedOrder) return;
  if (!can('manage_scrap')) {
    showToast('🚫 Zmetek může vyjmout jen vedení, TPV, mistr nebo admin.');
    return;
  }
  const scrap = positiveQty(selectedStation.qtyScrap);
  if (!scrap) {
    showToast('Zde není žádný zmetek k vyjmutí.');
    return;
  }
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  openModal('Vyjmout desku ze zmetku', `
    <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:14px;font-weight:800;color:var(--red);margin-bottom:5px">Zmetek na stanovišti ${stInfo?.name || selectedStation.stId}: ${scrap} ks</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Vyjmutí sníží zmetky i na navazujících stanovištích. Důvod je povinný pro audit zakázky.
      </div>
    </div>
    <div class="input-group">
      <div class="input-label">Počet vyjímaných desek</div>
      <input class="input" id="rs-count" type="number" min="1" max="${scrap}" value="1">
    </div>
    <div class="input-group">
      <div class="input-label">Odůvodnění *</div>
      <textarea class="input" id="rs-reason" rows="4" placeholder="např. deska předána na analýzu, zákazník schválil vyřazení, fyzicky odstraněna z dávky"
        style="resize:vertical;min-height:90px;font-family:inherit"></textarea>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Vyjmout', action:'submitScrapRemoval()', cls:'btn-danger' },
  ]);
  setTimeout(() => document.getElementById('rs-reason')?.focus(), 50);
}

function reduceDownstreamScrap(order, fromIndex, amount) {
  for (let index = fromIndex + 1; index < order.stations.length; index++) {
    const station = order.stations[index];
    const beforeScrap = positiveQty(station.qtyScrap);
    if (beforeScrap > 0) station.qtyScrap = Math.max(0, beforeScrap - amount);
    const beforeReceived = positiveQty(station.qtyReceived);
    if (beforeReceived > 0) station.qtyReceived = Math.max(0, beforeReceived - amount);
  }
}

function submitScrapRemoval() {
  if (!selectedStation || !selectedOrder) return;
  if (!can('manage_scrap')) {
    showToast('🚫 Nemáte oprávnění vyjmout zmetek.');
    return;
  }
  const availableScrap = positiveQty(selectedStation.qtyScrap);
  const count = Math.max(0, Number(document.getElementById('rs-count')?.value) || 0);
  const reason = document.getElementById('rs-reason')?.value.trim() || '';
  if (count < 1 || count > availableScrap) {
    showToast(`⚠️ Zadejte počet 1 až ${availableScrap}`);
    return;
  }
  if (!reason) {
    showToast('⚠️ Vyplňte odůvodnění vyjmutí zmetku.');
    return;
  }

  const before = cloneForAudit(selectedOrder);
  const stationIndex = selectedOrder.stations.findIndex(s => s === selectedStation || s.stId === selectedStation.stId);
  selectedStation.qtyScrap = Math.max(0, availableScrap - count);
  reduceDownstreamScrap(selectedOrder, stationIndex, count);
  syncOrderStationFlow(selectedOrder);
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  const note = {
    id: 'pn-scrap-' + Date.now(),
    orderId: selectedOrder.id,
    stationId: selectedStation.stId,
    stationIds: [selectedStation.stId],
    sourceStationId: selectedStation.stId,
    targetScope: 'stations',
    type: 'change',
    text: `Vyjmuto ze zmetku: ${count} ks. Důvod: ${reason}`,
    author: currentUser.name,
    authorUserId: currentUser.id,
    authorLogin: currentUser.login,
    authorRole: currentUser.role,
    createdAt: new Date().toISOString(),
  };
  PROD_NOTES.unshift(note);
  writeAudit(
    'scrap.removed',
    'order',
    selectedOrder.id,
    `${selectedOrder.number} · ${stInfo?.name || selectedStation.stId}: vyjmuto ze zmetku ${count} ks`,
    before,
    cloneForAudit(selectedOrder),
  );
  closeModal();
  saveState();
  renderStationDetail(stInfo);
  buildNav();
  showToast(`✅ Vyjmuto ze zmetku: ${count} ks`, { skipSave: true });
}

function setStatus(newStatus) {
  if (!selectedStation) return;
  if (newStatus === 'issue') { reportIssueModal(); return; }
  if (isOrderBlocked(selectedOrder)) {
    showToast('⛔ Zakázka je blokovaná. Stav nelze změnit.');
    return;
  }
  if (newStatus === 'completed') {
    selectedStation.qtyOk = Math.max(0, qtyAvailable() - positiveQty(selectedStation.qtyScrap));
    selectedStation.qtyRework = 0;
    const result = persistStationCounts({
      forceCompleted: true,
      message: '✅ Stanoviště dokončeno. Doplněn dostupný počet OK kusů.',
    });
    if (result?.ok) showToast(result.message);
    return;
  }
  const before = cloneForAudit(selectedStation);
  selectedStation.status = newStatus;
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  writeAudit(
    'station.status_changed',
    'order_station',
    stationAuditId(selectedOrder, selectedStation),
    `${selectedOrder.number} · ${stInfo?.name || selectedStation.stId}: stav ${stationStatusMeta(newStatus).label}`,
    before,
    cloneForAudit(selectedStation)
  );
  renderStationDetail(stInfo);
  showToast('Stav změněn: ' + stationStatusMeta(newStatus).label);
}

function updateStationStatusFromQty(validation = qtyValidation()) {
  if (!selectedStation) return;
  if (validation.sum === 0) selectedStation.status = 'waiting';
  else if (validation.remaining === 0) selectedStation.status = 'completed';
  else selectedStation.status = 'partial';
}

function nextStationAfterCurrent() {
  if (!selectedOrder || !selectedStation) return null;
  const idx = selectedOrder.stations.findIndex(s => s.stId === selectedStation.stId);
  return idx >= 0 ? selectedOrder.stations[idx + 1] : null;
}

function previousStationBeforeCurrent() {
  if (!selectedOrder || !selectedStation) return null;
  const idx = selectedOrder.stations.findIndex(s => s.stId === selectedStation.stId);
  return idx > 0 ? selectedOrder.stations[idx - 1] : null;
}

function processedQty(station) {
  return (Number(station?.qtyOk) || 0) + (Number(station?.qtyRework) || 0) + (Number(station?.qtyScrap) || 0);
}

function createMissingPreviousCheckAlert() {
  if ((Number(selectedStation?.qtyOk) || 0) <= 0) return '';
  const previous = previousStationBeforeCurrent();
  if (!previous || processedQty(previous) > 0) return '';
  const key = `missing-prev-check:${selectedOrder.id}:${previous.stId}:${selectedStation.stId}`;
  if (ISSUES.some(issue => issue.autoKey === key && !issue.resolved)) return '⚠️ Upozornění na chybějící předchozí kontrolu už bylo odesláno.';

  const prevInfo = STATIONS.find(x => x.id === previous.stId);
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  ISSUES.unshift({
    id: 'iss' + Date.now(),
    autoKey: key,
    orderId: selectedOrder.id,
    orderName: selectedOrder.name,
    orderNumber: selectedOrder.number,
    stationId: selectedStation.stId,
    stationName: stInfo?.name ?? '',
    stationIcon: stInfo?.icon ?? '⚠️',
    severity: 'medium',
    description: `Na stanovišti ${stInfo?.name || selectedStation.stId} byly zapsány OK kusy, ale předchozí stanoviště ${prevInfo?.name || previous.stId} nemá zapsanou kontrolu.`,
    reportedBy: 'Systém',
    reportedByRole: 'admin',
    targetRoles: ['admin','dispatcher','management','tpv'],
    reportedAt: new Date().toISOString(),
    resolved: false,
  });
  buildNav();
  return '⚠️ Odesláno upozornění: předchozí stanoviště nemá zapsanou kontrolu.';
}

function notifyNextStation(nextStation, qtyReady) {
  const source = STATIONS.find(x => x.id === selectedStation.stId);
  const target = STATIONS.find(x => x.id === nextStation.stId);
  const autoKey = `auto-ready:${selectedOrder.id}:${selectedStation.stId}:${nextStation.stId}:${qtyReady}`;
  if (PROD_NOTES.some(n => n.autoKey === autoKey)) return;
  PROD_NOTES.unshift({
    id: 'pn' + Date.now(),
    autoKey,
    orderId: selectedOrder.id,
    stationId: nextStation.stId,
    type: 'info',
    text: `${qtyReady} kusů ze stanoviště ${source?.name || selectedStation.stId} je připraveno. Lze pokračovat na stanovišti ${target?.name || nextStation.stId}.`,
    author: 'Systém',
    authorRole: 'admin',
    createdAt: new Date().toISOString(),
  });
}

function autoReleaseToNextStation() {
  const qtyReady = window.EZOP_FLOW?.readyForNextStation(selectedStation) ?? 0;
  if (!qtyReady) return '';
  const next = nextStationAfterCurrent();
  if (!next) return 'Zakázka nemá další stanoviště.';
  const previousReceived = Number(next.qtyReceived) || 0;
  if (qtyReady <= previousReceived) return '';
  next.qtyReceived = qtyReady;
  if (next.status === 'skipped') next.status = 'waiting';
  notifyNextStation(next, qtyReady);
  const target = STATIONS.find(x => x.id === next.stId);
  return `${target?.name || 'další stanoviště'} dostalo upozornění (${qtyReady} ks).`;
}

// ── PRODUCTION NOTES ──────────────────────────────────
const NOTE_TYPES = {
  info:     { label:'Informace',         icon:'ℹ️', color:'#3b82f6' },
  storage:  { label:'Umístění / sklad',  icon:'📍', color:'#22c55e' },
  material: { label:'Materiál / náhrada',icon:'🔧', color:'#a855f7' },
  message:  { label:'Vzkaz',             icon:'💬', color:'#22b8a6' },
  change:   { label:'Změna výroby',      icon:'🔁', color:'#f59e0b' },
  other:    { label:'Ostatní',           icon:'📝', color:'#999' },
};

function stationNotes(orderId, stationId) {
  return PROD_NOTES.filter(n => {
    if (n.orderId !== orderId) return false;
    const isAuthor = noteAuthoredByCurrentUser(n);
    const targetStationIds = Array.isArray(n.stationIds) ? n.stationIds.map(Number) : [];
    if (Array.isArray(n.targetRoles) && !n.targetRoles.includes(currentUser?.role) && !isAuthor) return false;
    return n.targetScope === 'all'
      || targetStationIds.includes(Number(stationId))
      || Number(n.stationId) === Number(stationId)
      || Number(n.sourceStationId) === Number(stationId);
  })
    .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function noteAuthoredByCurrentUser(note) {
  if (!currentUser || !note) return false;
  if (note.authorUserId && note.authorUserId === currentUser.id) return true;
  if (note.authorLogin && normalizeLogin(note.authorLogin) === normalizeLogin(currentUser.login)) return true;
  return note.author === currentUser.name && note.authorRole === currentUser.role;
}

function noteRecipientLabel(note) {
  if (note.targetScope === 'all') return 'Všem stanovištím';
  if (Array.isArray(note.targetRoles)) return 'Role: ' + note.targetRoles.map(r => ROLE_LABELS[r] || r).join(', ');
  if (Array.isArray(note.stationIds) && note.stationIds.length) {
    return 'Pro: ' + note.stationIds
      .map(id => STATIONS.find(x => x.id === Number(id)))
      .filter(Boolean)
      .map(st => `${st.icon} ${st.name}`)
      .join(', ');
  }
  const st = STATIONS.find(x => x.id === Number(note.stationId));
  return st ? `Pro: ${st.icon} ${st.name}` : '';
}

function noteDefaultTargetIds() {
  const next = nextStationAfterCurrent();
  return next ? [Number(next.stId)] : [];
}

function noteTargetLabel(targetScope, stationIds = []) {
  if (targetScope === 'all') return 'všem stanovištím';
  const labels = stationIds
    .map(id => STATIONS.find(x => x.id === Number(id)))
    .filter(Boolean)
    .map(st => `${st.icon} ${st.name}`);
  return labels.length ? labels.join(', ') : 'vybraným stanovištím';
}

function createNoteNotification(note, sourceStationId, targetStationId, index = 0) {
  if (!note || !targetStationId) return null;
  const source = STATIONS.find(x => x.id === Number(sourceStationId));
  const target = STATIONS.find(x => x.id === Number(targetStationId));
  if (!target) return null;
  const issue = {
    id: `iss-note-${Date.now()}-${target.id}-${index}`,
    autoKey: `note:${note.id}:${target.id}`,
    orderId: selectedOrder.id,
    orderName: selectedOrder.name,
    orderNumber: selectedOrder.number,
    stationId: Number(target.id),
    stationName: target.name,
    stationIcon: target.icon || '📝',
    severity: 'low',
    description: `Nová poznámka od ${source?.name || 'stanoviště'}: ${note.text}`,
    reportedBy: currentUser.name,
    reportedByUserId: currentUser.id,
    reportedByLogin: currentUser.login,
    reportedByRole: currentUser.role,
    targetScope: 'station',
    targetStationId: Number(target.id),
    targetLabel: `${target.icon || ''} ${target.name}`,
    reportedAt: new Date().toISOString(),
    resolved: false,
  };
  ISSUES.unshift(issue);
  return issue;
}

function renderStationNotes() {
  const list = stationNotes(selectedOrder.id, selectedStation.stId);
  if (list.length === 0) {
    return `<div style="text-align:center;color:var(--text3);font-size:12px;padding:14px 0">
      Zatím žádné poznámky. Přidejte info o umístění, náhradách součástek nebo změnách.
    </div>`;
  }
  return list.map(n => {
    const t = NOTE_TYPES[n.type] || NOTE_TYPES.other;
    const time = new Date(n.createdAt);
    const ago = Math.round((Date.now()-time)/60000);
    const agoTxt = ago<1?'právě teď':ago<60?`před ${ago} min`:ago<1440?`před ${Math.round(ago/60)} h`:`${time.toLocaleDateString('cs-CZ')}`;
    return `<div style="background:var(--card2);border-left:3px solid ${t.color};border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:11px;font-weight:700;color:${t.color}">${t.icon} ${t.label}</span>
        <span style="font-size:10px;color:var(--text3)">${agoTxt}</span>
      </div>
      ${noteRecipientLabel(n) ? `<div style="font-size:10px;color:var(--text2);margin-bottom:5px">${escapeHtml(noteRecipientLabel(n))}</div>` : ''}
      <div style="font-size:13px;color:var(--text);line-height:1.4;margin-bottom:6px">${escapeHtml(n.text)}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--text2)">
        <span>👤 ${n.author}</span>
        ${noteAuthoredByCurrentUser(n) || ['admin','dispatcher'].includes(currentUser.role)
          ? `<button class="btn btn-ghost btn-sm" style="font-size:10px;padding:3px 8px" onclick="deleteNote('${n.id}')">🗑️</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

function addNoteModal() {
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  const defaultTargetIds = noteDefaultTargetIds();
  openModal('📝 Přidat poznámku k výrobě', `
    <div style="background:var(--card2);border-radius:8px;padding:8px 10px;margin-bottom:14px;font-size:12px;color:var(--text2)">
      ${stInfo?.icon} <b style="color:var(--text)">${stInfo?.name}</b>
      &nbsp;·&nbsp; ${selectedOrder.number} ${selectedOrder.name}
    </div>

    <div class="input-group">
      <div class="input-label">Typ poznámky</div>
      <select class="input" id="an-type">
        ${Object.entries(NOTE_TYPES).map(([k,v]) =>
          `<option value="${k}" ${k==='message'?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
      </select>
    </div>

    <div class="input-group">
      <div class="input-label">Adresáti</div>
      <label style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:13px;color:var(--text)">
        <input type="checkbox" id="an-target-all" onchange="toggleNoteAllTargets(this.checked)">
        Všem stanovištím zakázky
      </label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px">
        ${selectedOrder.stations.map(station => {
          const st = STATIONS.find(x => x.id === station.stId);
          const checked = defaultTargetIds.includes(Number(station.stId)) ? 'checked' : '';
          return `<label style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:13px;color:var(--text)">
            <input type="checkbox" class="an-target-station" value="${station.stId}" ${checked}>
            <span>${st?.icon || ''} ${escapeHtml(st?.name || 'Stanoviště')}</span>
          </label>`;
        }).join('')}
      </div>
      <div style="font-size:11px;color:var(--text2);margin-top:5px">
        Lze vybrat více adresátů. Poznámka se zobrazí odesílateli na tomto stanovišti a zároveň všem vybraným stanovištím.
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">Text poznámky *</div>
      <textarea class="input" id="an-text" rows="4" placeholder="např. Polotovary v sušce, budova C, regál 4 nebo zákazník dodal náhradu R7 = 12k namísto 10k"
        style="resize:vertical;min-height:90px;font-family:inherit"></textarea>
    </div>

    <div style="font-size:11px;color:var(--text3)">
      💡 Příklady: kde jsou desky uložené, jaká součástka byla nahrazena za jinou,
      změna pájecího programu, instrukce pro další směnu.
    </div>
  `, [
    { label:'Zrušit',  action:'closeModal()',  cls:'btn-ghost'   },
    { label:'Uložit',  action:'submitNote()',  cls:'btn-primary' },
  ]);
  setTimeout(() => document.getElementById('an-text')?.focus(), 50);
}

function toggleNoteAllTargets(checked) {
  document.querySelectorAll('.an-target-station').forEach(input => {
    input.checked = checked;
    input.disabled = checked;
  });
}

function submitNote() {
  const text = document.getElementById('an-text').value.trim();
  if (!text) { showToast('⚠️ Vyplňte text poznámky'); return; }
  const sourceStationId = selectedStation.stId;
  const targetAll = document.getElementById('an-target-all')?.checked;
  const selectedTargetIds = Array.from(document.querySelectorAll('.an-target-station:checked'))
    .map(input => Number(input.value))
    .filter(Boolean);
  const targetStationIds = targetAll
    ? selectedOrder.stations.map(station => Number(station.stId)).filter(Boolean)
    : selectedTargetIds;
  if (!targetStationIds.length) {
    showToast('⚠️ Vyberte alespoň jedno cílové stanoviště');
    return;
  }
  const note = {
    id: 'pn' + Date.now(),
    orderId: selectedOrder.id,
    stationId: targetStationIds[0],
    stationIds: targetStationIds,
    sourceStationId,
    targetScope: targetAll ? 'all' : 'stations',
    type: document.getElementById('an-type').value,
    text,
    author: currentUser.name,
    authorUserId: currentUser.id,
    authorLogin: currentUser.login,
    authorRole: currentUser.role,
    createdAt: new Date().toISOString(),
  };
  PROD_NOTES.unshift(note);
  const notificationTargets = targetStationIds.filter(id => Number(id) !== Number(sourceStationId));
  const notifications = notificationTargets
    .map((stationId, index) => createNoteNotification(note, sourceStationId, stationId, index))
    .filter(Boolean);
  writeAudit(
    'note.created',
    'production_note',
    note.id,
    `${selectedOrder.number} · poznámka přidána`,
    null,
    cloneForAudit(note),
  );
  notifications.forEach(notification => {
    writeAudit(
      'note.notification_created',
      'issue',
      notification.id,
      `${selectedOrder.number} · poznámka odeslána pro ${notification.targetLabel}`,
      null,
      cloneForAudit(notification),
    );
  });
  saveState();
  closeModal();
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  renderStationDetail(stInfo);
  buildNav();
  showToast(`✅ Poznámka odeslána pro ${noteTargetLabel(note.targetScope, targetStationIds)}`, { skipSave: true });
}

function deleteNote(id) {
  const note = PROD_NOTES.find(n => n.id === id);
  PROD_NOTES = PROD_NOTES.filter(n => n.id !== id);
  if (note) {
    writeAudit(
      'note.deleted',
      'production_note',
      id,
      `${selectedOrder?.number || 'zakázka'} · poznámka smazána`,
      cloneForAudit(note),
      null,
    );
  }
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  renderStationDetail(stInfo);
  showToast('🗑️ Poznámka smazána');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ── REPORT ISSUE ──────────────────────────────────────
function reportIssueModal() {
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);
  openModal('⚠️ Nahlásit problém vedoucímu', `
    <div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:10px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Stanoviště</div>
      <div style="font-size:14px;font-weight:700;color:var(--red)">${stInfo?.icon ?? ''} ${stInfo?.name ?? ''} · ${selectedOrder.name}</div>
    </div>

    <div class="input-group">
      <div class="input-label">Závažnost</div>
      <select class="input" id="ri-severity">
        <option value="low">🟡 Nízká – nezastaví výrobu</option>
        <option value="medium" selected>🟠 Střední – pozor na další kusy</option>
        <option value="high">🔴 Vysoká – výroba zastavena</option>
      </select>
    </div>

    <div class="input-group">
      <div class="input-label">Komu poslat upozornění</div>
      <select class="input" id="ri-target">
        ${issueRecipientOptionsHtml()}
      </select>
    </div>

    <div class="input-group">
      <div class="input-label">Popis problému *</div>
      <textarea class="input" id="ri-desc" rows="4" placeholder="Popište, co se stalo (povinné)..."
        style="resize:vertical;min-height:90px;font-family:inherit"></textarea>
    </div>

    <div style="background:var(--card2);border-radius:8px;padding:10px;font-size:11px;color:var(--text2);margin-top:6px">
      ℹ️ Hlášení uvidí odesílatel a vybraný adresát. Pokud vyberete roli, upozornění se zobrazí všem uživatelům v dané roli.
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'⚠️ Nahlásit problém', action:'submitIssue()', cls:'btn-danger' },
  ]);
  setTimeout(() => document.getElementById('ri-desc')?.focus(), 50);
}

function submitIssue() {
  const desc = document.getElementById('ri-desc').value.trim();
  if (!desc && APP_SETTINGS.requireNoteOnIssue) {
    showToast('⚠️ Vyplňte popis problému');
    return;
  }
  const severity = document.getElementById('ri-severity').value;
  const target = parseIssueTarget(document.getElementById('ri-target')?.value);
  const stInfo = STATIONS.find(x => x.id === selectedStation.stId);

  const issue = {
    id: 'iss' + Date.now(),
    orderId: selectedOrder.id,
    orderName: selectedOrder.name,
    orderNumber: selectedOrder.number,
    stationId: selectedStation.stId,
    stationName: stInfo?.name ?? '',
    stationIcon: stInfo?.icon ?? '⚠️',
    severity,
    description: desc || '(bez popisu)',
    reportedBy: currentUser.name,
    reportedByUserId: currentUser.id,
    reportedByLogin: currentUser.login,
    reportedByRole: currentUser.role,
    ...target,
    reportedAt: new Date().toISOString(),
    resolved: false,
  };
  ISSUES.unshift(issue);

  const beforeStation = cloneForAudit(selectedStation);
  selectedStation.status = 'issue';
  writeAudit(
    'issue.created',
    'issue',
    issue.id,
    `${selectedOrder.number} · problém nahlášen pro ${target.targetLabel}`,
    null,
    cloneForAudit(issue),
  );
  writeAudit(
    'station.status_changed',
    'order_station',
    stationAuditId(selectedOrder, selectedStation),
    `${selectedOrder.number} · ${stInfo?.name || 'stanoviště'}: problém`,
    beforeStation,
    cloneForAudit(selectedStation),
  );
  closeModal();
  renderStationDetail(stInfo);
  buildNav();
  showToast('✅ Problém odeslán: ' + target.targetLabel + ' (' + sevLabel(severity) + ')');
}

function sevLabel(s) {
  return { low:'🟡 Nízká', medium:'🟠 Střední', high:'🔴 Vysoká' }[s] || s;
}

function resolveIssue(id) {
  const i = ISSUES.find(x => x.id === id);
  if (!i) return;
  const before = cloneForAudit(i);
  i.resolved = true;
  i.resolvedBy = currentUser.name;
  i.resolvedAt = new Date().toISOString();
  writeAudit(
    'issue.resolved',
    'issue',
    id,
    `${i.orderNumber || 'zakázka'} · problém vyřešen`,
    before,
    cloneForAudit(i),
  );
  showToast('✅ Problém vyřešen');
  if (currentPage === 'dashboard') renderDashboard();
  if (currentPage === 'issues')    renderIssues();
}

function forwardQtyModal() {
  openModal('Předat kusy', `
    <div style="font-size:13px;color:var(--text2);margin-bottom:12px">
      Předat ${selectedStation.qtyOk} OK kusů na další stanoviště výroby.
    </div>
    <div style="text-align:center">
      <div style="font-size:40px;font-weight:800;color:var(--gold)">${selectedStation.qtyOk} ks</div>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Potvrdit předání', action:'doForward()', cls:'btn-primary' },
  ]);
}

function doForward() {
  closeModal();
  showToast('✅ Kusy předány dál');
}

// ── NUMPAD ────────────────────────────────────────────
function openNumpad(field, title, currentVal) {
  if (isOrderBlocked(selectedOrder)) {
    showToast('⛔ Zakázka je blokovaná. Počty nelze měnit.');
    return;
  }
  numpadField = field;
  numpadValue = String(currentVal || 0);
  document.getElementById('numpad-title').textContent = title + ' (ks)';
  document.getElementById('numpad-display').textContent = numpadValue;
  document.getElementById('numpad-overlay').classList.add('visible');

  // Highlight active field
  document.querySelectorAll('.qty-field').forEach(f => f.classList.remove('active'));
  const el = document.getElementById('qtf-' + field);
  if (el) el.classList.add('active');
}

function closeNumpad() {
  document.getElementById('numpad-overlay').classList.remove('visible');
  document.querySelectorAll('.qty-field').forEach(f => f.classList.remove('active'));
  numpadField = null;
  numpadValue = '';
}

function numInput(digit) {
  if (numpadValue === '0') numpadValue = digit;
  else numpadValue += digit;
  if (numpadValue.length > 5) numpadValue = numpadValue.slice(0,5);
  document.getElementById('numpad-display').textContent = numpadValue;
}

function numDelete() {
  numpadValue = numpadValue.slice(0, -1) || '0';
  document.getElementById('numpad-display').textContent = numpadValue;
}

function numConfirm() {
  if (!selectedStation || !numpadField) { closeNumpad(); return; }
  const val = parseInt(numpadValue, 10) || 0;
  const fieldMap = { ok:'qtyOk', rework:'qtyRework', scrap:'qtyScrap' };

  // Validace: pole samotné nesmí překročit dostupné množství
  const available = qtyAvailable();
  if (val > available) {
    showToast(`⛔ Nelze: ${val} > ${available} ks vydaných`);
    return;
  }

  if (numpadField === 'scrap' && val < positiveQty(selectedStation.qtyScrap)) {
    closeNumpad();
    showToast('⚠️ Snížení zmetku musí mít odůvodnění.');
    removeScrapModal();
    return;
  }

  selectedStation[fieldMap[numpadField]] = val;
  const valEl = document.getElementById('qtv-' + numpadField);
  if (valEl) valEl.textContent = val;
  closeNumpad();
  updateQtySummary();
  const v = qtyValidation();
  if (v.exceed) {
    showToast(`⚠️ Pozor: součet ${v.sum} přesahuje ${v.available} ks!`);
  } else {
    showToast(`${numpadField === 'ok' ? 'OK' : numpadField === 'rework' ? 'Oprava' : 'Zmetek'}: ${val} ks`);
  }
}

// ── KPI ───────────────────────────────────────────────
let kpiFilters = { customer:'', product:'', number:'' };

function renderKpi() {
  document.getElementById('page-kpi').innerHTML = renderKpiHtml();
}

function renderKpiHtml() {
  const kpiOrders = filteredKpiOrders();
  const totalOk = kpiOrders.reduce((a,o) => a + orderGoodQty(o),0);
  const totalScrap = kpiOrders.reduce((a,o) => a + o.stations.reduce((b,s) => b+s.qtyScrap,0),0);
  const totalRework = kpiOrders.reduce((a,o) => a + o.stations.reduce((b,s) => b+s.qtyRework,0),0);
  const totalQty = kpiOrders.reduce((a,o) => a+o.qty,0);
  const yield_ = totalQty > 0 ? Math.round(totalOk/(totalQty)*100) : 0;

  const stationStats = STATIONS.map(st => {
    const allSt = kpiOrders.flatMap(o => o.stations.filter(s=>s.stId===st.id));
    const stOk = allSt.reduce((a,s)=>a+s.qtyOk,0);
    const stAll = allSt.reduce((a,s)=>a+s.qtyOk+s.qtyRework+s.qtyScrap,0);
    return { ...st, ok:stOk, total:stAll, pct:stAll>0?Math.round(stOk/stAll*100):null };
  }).filter(s => s.total > 0);

  return `
    <div style="padding:12px 0 8px;font-size:16px;font-weight:800;color:var(--gold)">📊 KPI – Výkonnost výroby</div>
    <div class="card">
      <div class="card-title">🔎 Filtr KPI</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px">
        <div>
          <div class="input-label">Zákazník</div>
          <select class="input" onchange="setKpiFilter('customer', this.value)">
            <option value="">Všichni zákazníci</option>
            ${knownCustomers().map(customer => `<option value="${escapeHtml(customer)}" ${kpiFilters.customer===customer?'selected':''}>${escapeHtml(customer)}</option>`).join('')}
          </select>
        </div>
        <div>
          <div class="input-label">Výrobek</div>
          <input class="input" value="${escapeHtml(kpiFilters.product)}" placeholder="název výrobku" oninput="setKpiFilter('product', this.value)">
        </div>
        <div>
          <div class="input-label">Číslo zakázky</div>
          <input class="input" value="${escapeHtml(kpiFilters.number)}" placeholder="např. 261100" oninput="setKpiFilter('number', this.value)">
        </div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;flex-wrap:wrap">
        <div style="font-size:12px;color:var(--text2)">Zobrazeno ${kpiOrders.length} z ${ORDERS.length} zakázek</div>
        <button class="btn btn-ghost btn-sm" onclick="clearKpiFilters()">Vymazat filtr</button>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-val" style="color:var(--green)">${yield_}%</div>
        <div class="stat-lbl">Výtěžnost</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${totalOk}</div>
        <div class="stat-lbl">OK kusů</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--amber)">${totalRework}</div>
        <div class="stat-lbl">Oprav</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:var(--red)">${totalScrap}</div>
        <div class="stat-lbl">Zmetků</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">📈 Výtěžnost podle stanovišť</div>
      ${stationStats.length ? stationStats.map(s => `
        <div class="kpi-bar-row">
          <div class="kpi-bar-lbl">${s.icon} ${s.name.split(' ')[0]}</div>
          <div class="kpi-bar-track"><div class="kpi-bar-fill" style="width:${s.pct}%"></div></div>
          <div class="kpi-bar-val">${s.pct}%</div>
        </div>`).join('') : `<div style="font-size:12px;color:var(--text2)">Pro vybraný filtr nejsou data stanovišť.</div>`}
    </div>

    <div class="card">
      <div class="card-title">📋 Přehled zakázek</div>
      <table class="tbl">
        <thead><tr><th>Zakázka</th><th>Plán</th><th>OK</th><th>Oprava</th><th>Zmetek</th></tr></thead>
        <tbody>
          ${kpiOrders.length ? kpiOrders.map(o => {
            const ok = orderGoodQty(o);
            const rw = o.stations.reduce((a,s)=>a+s.qtyRework,0);
            const sc = o.stations.reduce((a,s)=>a+s.qtyScrap,0);
            return `<tr>
              <td style="font-size:12px;font-weight:600">
                <div>${escapeHtml(o.name)}</div>
                <div style="font-size:10px;color:var(--text3);margin-top:2px">${escapeHtml(o.number)} · ${escapeHtml(o.customer)}</div>
              </td>
              <td>${o.qty}</td>
              <td style="color:var(--green);font-weight:700">${ok}</td>
              <td style="color:var(--amber)">${rw}</td>
              <td style="color:var(--red)">${sc}</td>
            </tr>`;
          }).join('') : `<tr><td colspan="5" style="font-size:12px;color:var(--text2);padding:14px">Žádná zakázka neodpovídá filtru.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function filteredKpiOrders() {
  const customer = normalizeSearch(kpiFilters.customer);
  const product = normalizeSearch(kpiFilters.product);
  const number = normalizeSearch(kpiFilters.number);
  return ORDERS.filter(order => {
    const byCustomer = !customer || normalizeSearch(order.customer) === customer;
    const byProduct = !product || normalizeSearch(order.name).includes(product);
    const byNumber = !number || normalizeSearch(order.number).includes(number);
    return byCustomer && byProduct && byNumber;
  });
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function setKpiFilter(key, value) {
  kpiFilters[key] = value || '';
  rerenderKpiLocation();
}

function clearKpiFilters() {
  kpiFilters = { customer:'', product:'', number:'' };
  rerenderKpiLocation();
}

function rerenderKpiLocation() {
  if (currentPage === 'admin' && adminTab === 'kpi_report') {
    document.getElementById('adm-kpi').innerHTML = renderKpiHtml();
    return;
  }
  renderKpi();
}

// ── ADMIN ─────────────────────────────────────────────
let adminTab = 'users';
// ── OZNÁMENÍ ──────────────────────────────────────────
const ANNOUNCE_TYPES = {
  info:    { label: 'Informace', color: 'var(--blue,#60a5fa)', icon: 'ℹ️'  },
  warning: { label: 'Upozornění', color: 'var(--amber)',        icon: '⚠️' },
  urgent:  { label: 'Urgentní',  color: 'var(--red)',           icon: '🚨' },
};

function visibleAnnouncements() {
  const uid = currentUser?.id;
  if (!uid) return [];
  return ANNOUNCEMENTS
    .filter(a => !Array.isArray(a.dismissedBy) || !a.dismissedBy.includes(uid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function dismissAnnouncement(id) {
  const a = ANNOUNCEMENTS.find(x => x.id === id);
  if (!a || !currentUser) return;
  if (!Array.isArray(a.dismissedBy)) a.dismissedBy = [];
  if (!a.dismissedBy.includes(currentUser.id)) a.dismissedBy.push(currentUser.id);
  saveState();
  if (typeof renderDashboard === 'function') renderDashboard();
}

function announcementsBannerHtml() {
  const list = visibleAnnouncements();
  if (list.length === 0) return '';
  return list.slice(0, 3).map(a => {
    const t = ANNOUNCE_TYPES[a.type] || ANNOUNCE_TYPES.info;
    return `
      <div class="card" style="border-left:4px solid ${t.color};margin-bottom:10px;position:relative">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="font-size:22px">${t.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:${t.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">
              ${t.label}${a.title ? ' · ' + escapeHtml(a.title) : ''}
            </div>
            <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5">${escapeHtml(a.text)}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:6px">
              ${escapeHtml(a.createdByName || 'Admin')} · ${formatDateTime(a.createdAt)}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:14px;color:var(--text3)"
            title="Skrýt"
            onclick="dismissAnnouncement('${escapeHtml(a.id)}')">✕</button>
        </div>
      </div>`;
  }).join('');
}

function renderAdminAnnouncements() {
  if (!can('app_settings')) return '';
  const list = [...ANNOUNCEMENTS].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return `
    <div class="card">
      <div class="card-title">📢 Oznámení pro tým</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:10px">
        Vytvořené oznámení se zobrazí všem uživatelům na úvodní obrazovce. Každý si může
        oznámení skrýt tlačítkem ✕. Smazáním v této tabulce zmizí všem.
      </div>
      <button class="btn btn-primary btn-sm" onclick="openAddAnnouncementModal()">＋ Nové oznámení</button>
    </div>
    ${list.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--text2);padding:32px 16px">
        <div style="font-size:32px;margin-bottom:8px">📢</div>
        <div>Zatím žádná oznámení.</div>
      </div>` : list.map(a => {
        const t = ANNOUNCE_TYPES[a.type] || ANNOUNCE_TYPES.info;
        const totalUsers = (USERS || []).length;
        const dismissed = Array.isArray(a.dismissedBy) ? a.dismissedBy.length : 0;
        return `
        <div class="card" style="border-left:4px solid ${t.color};margin-bottom:10px">
          <div style="display:flex;align-items:flex-start;gap:10px">
            <div style="font-size:22px">${t.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:700;color:${t.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">
                ${t.label}${a.title ? ' · ' + escapeHtml(a.title) : ''}
              </div>
              <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.5;margin-bottom:6px">${escapeHtml(a.text)}</div>
              <div style="font-size:11px;color:var(--text3)">
                ${escapeHtml(a.createdByName || 'Admin')} · ${formatDateTime(a.createdAt)}
                · Skryto: ${dismissed}/${totalUsers}
              </div>
            </div>
            <button class="btn btn-danger btn-sm" style="padding:4px 8px"
              onclick="deleteAnnouncement('${escapeHtml(a.id)}')">🗑️</button>
          </div>
        </div>`;
      }).join('')}
  `;
}

function openAddAnnouncementModal() {
  openModal('📢 Nové oznámení', `
    <div class="input-group">
      <div class="input-label">Typ</div>
      <select class="input" id="ann-type">
        ${Object.entries(ANNOUNCE_TYPES).map(([v, t]) => `<option value="${v}">${t.icon} ${t.label}</option>`).join('')}
      </select>
    </div>
    <div class="input-group">
      <div class="input-label">Nadpis (volitelné)</div>
      <input class="input" id="ann-title" maxlength="80" placeholder="např. Servisní okno v sobotu">
    </div>
    <div class="input-group">
      <div class="input-label">Text oznámení</div>
      <textarea class="input" id="ann-text" rows="5" placeholder="Napiš obsah oznámení…"
        style="resize:vertical;min-height:120px"></textarea>
    </div>
  `, [
    { label: '✕ Zrušit',     cls: 'btn-ghost',   action: 'closeModal()' },
    { label: '📢 Publikovat', cls: 'btn-primary', action: 'saveAnnouncement()' },
  ]);
}

function saveAnnouncement() {
  const text = document.getElementById('ann-text')?.value?.trim();
  if (!text) { showToast('⚠️ Text je prázdný'); return; }
  const type  = document.getElementById('ann-type')?.value || 'info';
  const title = document.getElementById('ann-title')?.value?.trim() || '';
  ANNOUNCEMENTS.push({
    id: 'ann' + Date.now() + Math.random().toString(36).slice(2,6),
    type, title, text,
    createdBy: currentUser?.id || null,
    createdByName: currentUser?.name || 'Admin',
    createdAt: new Date().toISOString(),
    dismissedBy: [],
  });
  saveState();
  closeModal();
  showToast('📢 Oznámení publikováno');
  renderAdmin();
}

function deleteAnnouncement(id) {
  if (!confirm('Smazat oznámení? Zmizí všem uživatelům.')) return;
  ANNOUNCEMENTS = ANNOUNCEMENTS.filter(a => a.id !== id);
  saveState();
  showToast('🗑️ Oznámení smazáno');
  renderAdmin();
}

// ── DOCHÁZKA TÝMU (admin) ────────────────────────────
function renderAdminTeamAttendance() {
  if (!can('app_settings')) return '';
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStr = monthStart.toISOString().slice(0, 7);

  const stats = (USERS || []).map(u => {
    const ws  = USER_WORKSPACE[u.id] || {};
    const att = (ws.attendance || []).filter(a => a.date >= monthStr + '-01');
    let totalMin = 0;
    let openShift = null;
    let lastDate  = null;
    att.forEach(a => {
      if (a.checkIn && a.checkOut) {
        totalMin += Math.max(0, Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 60000));
      } else if (a.checkIn && !a.checkOut) {
        openShift = a;
      }
      if (!lastDate || a.date > lastDate) lastDate = a.date;
    });
    return { user: u, totalMin, days: att.length, openShift, lastDate };
  }).sort((a, b) => b.totalMin - a.totalMin);

  return `
    <div class="card">
      <div class="card-title">🕐 Docházka týmu – ${monthStart.toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' })}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Sumář odpracovaných hodin v aktuálním měsíci. Klikni na uživatele pro detail
        a možnost opravy chybných záznamů.
      </div>
    </div>

    ${stats.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--text2);padding:32px 16px">
        Žádní uživatelé.
      </div>` : stats.map(s => `
      <div class="card" style="margin-bottom:8px;cursor:pointer" onclick="openUserAttendanceDetail('${escapeHtml(s.user.id)}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:24px">${escapeHtml(s.user.avatar || '👤')}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:700;color:var(--text)">${escapeHtml(s.user.name)}</div>
            <div style="font-size:11px;color:var(--text3)">
              ${ROLE_LABELS[s.user.role] || s.user.role}
              ${s.openShift ? ' · <span style="color:var(--green)">🟢 Právě přihlášen</span>' : ''}
              ${s.lastDate ? ' · poslední: ' + formatDate(s.lastDate) : ' · bez záznamu'}
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:18px;font-weight:800;color:var(--gold)">
              ${Math.floor(s.totalMin / 60)}h ${s.totalMin % 60}m
            </div>
            <div style="font-size:11px;color:var(--text3)">${s.days} ${s.days === 1 ? 'den' : s.days < 5 ? 'dny' : 'dní'}</div>
          </div>
        </div>
      </div>`).join('')}

    <div class="card" style="margin-top:10px">
      <button class="btn btn-ghost" style="width:100%" onclick="exportTeamAttendanceCsv()">📥 Stáhnout CSV (celý měsíc)</button>
    </div>
  `;
}

function openUserAttendanceDetail(userId) {
  const u = (USERS || []).find(x => x.id === userId);
  if (!u) return;
  const ws  = USER_WORKSPACE[userId] || {};
  const att = [...(ws.attendance || [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60);

  const rows = att.map(a => {
    const mins = a.checkIn && a.checkOut
      ? Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 60000)
      : null;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;color:var(--text)">${formatDate(a.date)}</div>
          <div style="font-size:11px;color:var(--text2)">
            ${a.checkIn ? formatTime(a.checkIn) : '–'} → ${a.checkOut ? formatTime(a.checkOut) : '⏳ otevřeno'}
            ${mins !== null ? ` · <b>${Math.floor(mins/60)}h ${mins%60}m</b>` : ''}
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" style="padding:2px 8px"
          onclick="adminEditAttendance('${escapeHtml(userId)}','${escapeHtml(a.id)}')">✏️</button>
        <button class="btn btn-danger btn-sm" style="padding:2px 8px"
          onclick="adminDeleteAttendance('${escapeHtml(userId)}','${escapeHtml(a.id)}')">🗑️</button>
      </div>`;
  }).join('') || '<div style="text-align:center;color:var(--text2);padding:20px">Žádné záznamy</div>';

  openModal(`🕐 Docházka · ${u.name}`, rows, [
    { label: '✕ Zavřít', cls: 'btn-primary', action: 'closeModal()' },
  ]);
}

function adminEditAttendance(userId, recordId) {
  const ws  = USER_WORKSPACE[userId];
  const rec = ws?.attendance?.find(a => a.id === recordId);
  if (!rec) return;
  const inT  = rec.checkIn  ? new Date(rec.checkIn).toTimeString().slice(0, 5)  : '';
  const outT = rec.checkOut ? new Date(rec.checkOut).toTimeString().slice(0, 5) : '';
  openModal('✏️ Upravit docházku', `
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">Den: <b>${formatDate(rec.date)}</b></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
      <div class="input-group">
        <div class="input-label">Příchod</div>
        <input class="input" id="att-in"  type="time" value="${inT}">
      </div>
      <div class="input-group">
        <div class="input-label">Odchod</div>
        <input class="input" id="att-out" type="time" value="${outT}">
      </div>
    </div>
  `, [
    { label: '✕ Zrušit',  cls: 'btn-ghost',   action: 'closeModal()' },
    { label: '✔ Uložit',  cls: 'btn-primary', action: `saveAttendanceEdit('${userId}','${recordId}')` },
  ]);
}

function saveAttendanceEdit(userId, recordId) {
  const ws  = USER_WORKSPACE[userId];
  const rec = ws?.attendance?.find(a => a.id === recordId);
  if (!rec) return;
  const inV  = document.getElementById('att-in')?.value;
  const outV = document.getElementById('att-out')?.value;
  if (inV)  rec.checkIn  = new Date(rec.date + 'T' + inV  + ':00').toISOString();
  if (outV) rec.checkOut = new Date(rec.date + 'T' + outV + ':00').toISOString();
  else if (outV === '') rec.checkOut = null;
  saveState();
  closeModal();
  showToast('✅ Záznam upraven');
  renderAdmin();
}

function adminDeleteAttendance(userId, recordId) {
  if (!confirm('Smazat tento záznam docházky?')) return;
  const ws = USER_WORKSPACE[userId];
  if (!ws) return;
  ws.attendance = (ws.attendance || []).filter(a => a.id !== recordId);
  saveState();
  showToast('🗑️ Záznam smazán');
  closeModal();
  renderAdmin();
}

function exportTeamAttendanceCsv() {
  const monthStart = new Date();
  monthStart.setDate(1);
  const monthStr = monthStart.toISOString().slice(0, 7);
  const rows = [['Uživatel', 'Login', 'Role', 'Datum', 'Příchod', 'Odchod', 'Minuty']];
  (USERS || []).forEach(u => {
    const ws = USER_WORKSPACE[u.id] || {};
    (ws.attendance || []).filter(a => a.date >= monthStr + '-01').forEach(a => {
      const mins = a.checkIn && a.checkOut
        ? Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 60000)
        : '';
      rows.push([
        u.name, u.login, ROLE_LABELS[u.role] || u.role, a.date,
        a.checkIn ? formatTime(a.checkIn) : '',
        a.checkOut ? formatTime(a.checkOut) : '',
        mins,
      ]);
    });
  });
  downloadCsv(`dochazka-${monthStr}.csv`, rows);
}

function downloadCsv(filename, rows) {
  const csv = rows.map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderAdmin() {
  if (!can('app_settings')) {
    navigateTo('dashboard');
    showToast('🚫 Nemáte oprávnění ke správě aplikace.');
    return;
  }
  document.getElementById('page-admin').innerHTML = `
    <div style="padding:12px 0 8px;font-size:16px;font-weight:800;color:var(--gold)">⚙️ Správa aplikace</div>
    <div class="admin-tabs">
      <div class="admin-tab ${adminTab==='users'?'active':''}" onclick="switchAdminTab('users')">👥 Uživatelé</div>
      <div class="admin-tab ${adminTab==='login_logs'?'active':''}" onclick="switchAdminTab('login_logs')">🔐 Přihlášení</div>
      <div class="admin-tab ${adminTab==='audit'?'active':''}" onclick="switchAdminTab('audit')">🧾 Audit</div>
      <div class="admin-tab ${adminTab==='settings'?'active':''}" onclick="switchAdminTab('settings')">⚙️ Nastavení</div>
      <div class="admin-tab ${adminTab==='stations'?'active':''}" onclick="switchAdminTab('stations')">🏭 Stanoviště</div>
      <div class="admin-tab ${adminTab==='orders_mgmt'?'active':''}" onclick="switchAdminTab('orders_mgmt')">📋 Zakázky</div>
      <div class="admin-tab ${adminTab==='kpi_report'?'active':''}" onclick="switchAdminTab('kpi_report')">📊 KPI</div>
      <div class="admin-tab ${adminTab==='cloud'?'active':''}" onclick="switchAdminTab('cloud')">☁️ Cloud</div>
      <div class="admin-tab ${adminTab==='lupanet'?'active':''}" onclick="switchAdminTab('lupanet')">🔌 Lupa NET</div>
      <div class="admin-tab ${adminTab==='ezop4'?'active':''}" onclick="switchAdminTab('ezop4')">🚀 Ezop4</div>
      <div class="admin-tab ${adminTab==='announcements'?'active':''}" onclick="switchAdminTab('announcements')">📢 Oznámení</div>
      <div class="admin-tab ${adminTab==='team_attendance'?'active':''}" onclick="switchAdminTab('team_attendance')">🕐 Docházka týmu</div>
    </div>

    <div class="admin-section ${adminTab==='users'?'active':''}" id="adm-users">
      ${renderAdminUsers()}
    </div>
    <div class="admin-section ${adminTab==='login_logs'?'active':''}" id="adm-login-logs">
      ${renderAdminLoginLogs()}
    </div>
    <div class="admin-section ${adminTab==='audit'?'active':''}" id="adm-audit">
      ${renderAdminAudit()}
    </div>
    <div class="admin-section ${adminTab==='settings'?'active':''}" id="adm-settings">
      ${renderAdminSettings()}
    </div>
    <div class="admin-section ${adminTab==='stations'?'active':''}" id="adm-stations">
      ${renderAdminStations()}
    </div>
    <div class="admin-section ${adminTab==='orders_mgmt'?'active':''}" id="adm-orders">
      ${renderAdminOrders()}
    </div>
    <div class="admin-section ${adminTab==='kpi_report'?'active':''}" id="adm-kpi">
      ${renderKpiHtml()}
    </div>
    <div class="admin-section ${adminTab==='cloud'?'active':''}" id="adm-cloud">
      ${renderAdminCloud()}
    </div>
    <div class="admin-section ${adminTab==='lupanet'?'active':''}" id="adm-lupanet">
      ${renderAdminLupaNet()}
    </div>
    <div class="admin-section ${adminTab==='ezop4'?'active':''}" id="adm-ezop4">
      ${renderAdminEzop4()}
    </div>
    <div class="admin-section ${adminTab==='announcements'?'active':''}" id="adm-announcements">
      ${renderAdminAnnouncements()}
    </div>
    <div class="admin-section ${adminTab==='team_attendance'?'active':''}" id="adm-team-attendance">
      ${renderAdminTeamAttendance()}
    </div>
  `;
}

function renderAdminEzop4() {
  const tableExport = window.EZOP4_TO_TABLES?.(currentState());
  const authMode = ezop4AuthMode();
  const authReady = Boolean(db && window.EZOP4_AUTH?.createSupabaseAuthPort);
  const count = name => tableExport?.[name]?.length ?? 0;
  const totalRows = tableExport
    ? Object.values(tableExport).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)
    : 0;
  const cards = [
    ['Zakázky', count('orders'), 'orders'],
    ['Stanoviště zakázek', count('order_stations'), 'order_stations'],
    ['Problémy', count('issues'), 'issues'],
    ['Poznámky', count('production_notes'), 'production_notes'],
  ];

  return `
    <div class="card" style="border-left:4px solid var(--gold)">
      <div class="card-title">🚀 Produkční základ Ezop4</div>
      <div style="font-size:13px;color:var(--text);line-height:1.55">
        Aplikace zatím běží v kompatibilním režimu Ezop3, ale už obsahuje nové Supabase schema
        pro tabulky, role, RLS a audit log. Tato obrazovka slouží ke kontrole připravenosti
        a migraci současných dat do tabulkového formátu.
      </div>
    </div>

    <div class="stat-grid">
      ${cards.map(([label, value, table]) => `
        <div class="stat-card">
          <div class="stat-val">${value}</div>
          <div class="stat-lbl">${label}</div>
          <div style="font-size:10px;color:var(--text3);margin-top:4px">${table}</div>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-title">🧱 Databázová připravenost</div>
      ${ezop4ChecklistRow('schema.sql', 'Tabulky pro zakázky, stanoviště, problémy, poznámky, audit a profily jsou připravené.', true)}
      ${ezop4ChecklistRow('Supabase Auth + RLS', 'Schéma obsahuje role operator/tpv/mistr/vedení/admin a RLS policy základ.', true)}
      ${ezop4ChecklistRow('Migrace app_state', 'Současná data lze převést na tabulkový JSON export.', Boolean(tableExport))}
      ${ezop4ChecklistRow('Auth režim', authMode === 'supabase' ? 'Supabase Auth je zapnutý, demo heslo 1234 zůstává fallback.' : 'Aktivní je demo login. Supabase Auth lze zapnout níže.', authMode === 'supabase')}
      ${ezop4ChecklistRow('Audit log základ', 'Změny počtů, stavů, zakázek, programů, poznámek a problémů se zapisují do auditu.', true)}
      ${ezop4ChecklistRow('Napojení UI na tabulky', 'Další krok: přepnout zakázky z app_state na orders/order_stations.', false)}
    </div>

    <div class="card">
      <div class="card-title">🔐 Režim přihlášení</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">
        Demo režim používá lokální uživatele a heslo 1234. Supabase režim se nejdřív pokusí
        přihlásit přes Supabase Auth a načíst roli z tabulky <b>profiles</b>; pokud selže,
        uživatel se může pořád přihlásit demo účtem.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <button class="btn ${authMode === 'demo' ? 'btn-primary' : 'btn-ghost'}" onclick="setEzop4AuthModeFromAdmin('demo')">Demo login</button>
        <button class="btn ${authMode === 'supabase' ? 'btn-primary' : 'btn-ghost'}" onclick="setEzop4AuthModeFromAdmin('supabase')">Supabase Auth</button>
      </div>
      <div style="margin-top:10px;font-size:11px;color:${authReady ? 'var(--green)' : 'var(--orange)'}">
        ${authReady ? '✅ Supabase klient je připravený.' : '⚠️ Supabase klient zatím není připojený.'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">📦 Export pro tabulkové Supabase</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5;margin-bottom:12px">
        Export vytvoří jeden JSON soubor s tabulkami podle schema.sql. Neobsahuje hesla,
        lokální přihlašovací logy ani profily uložené v prohlížeči. Celkem připraveno:
        <b style="color:var(--gold)">${totalRows}</b> řádků.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="exportEzop4Tables()">📤 Stáhnout Ezop4 table export</button>
        <button class="btn btn-ghost" onclick="showEzop4SchemaHelp()">🧾 Jak spustit schema.sql</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">➡️ Doporučený další krok</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.55">
        1. Spustit schema.sql v Supabase SQL Editoru.<br>
        2. Vytvořit uživatele v Supabase Auth a doplnit tabulku profiles.<br>
        3. Přepnout login na Supabase Auth.<br>
        4. Přesunout zakázky a počty z app_state do tabulek.
      </div>
    </div>
  `;
}

function ezop4ChecklistRow(title, text, done) {
  return `<div style="display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)">
    <div style="font-size:18px">${done ? '✅' : '⏳'}</div>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:800;color:var(--text)">${title}</div>
      <div style="font-size:11px;color:var(--text2);line-height:1.4">${text}</div>
    </div>
  </div>`;
}

function renderAdminAudit() {
  const rows = auditRows().slice(0, 120);
  const countAction = prefix => rows.filter(row => row.action.startsWith(prefix)).length;
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div style="font-size:13px;color:var(--text2)">
        Posledních ${rows.length} auditních událostí uložených lokálně v této instalaci.
      </div>
      <button class="btn btn-danger btn-sm" onclick="clearAuditLogFromAdmin()">Vymazat audit</button>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val">${auditRows().length}</div><div class="stat-lbl">Záznamů celkem</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--green)">${countAction('station.')}</div><div class="stat-lbl">Stanoviště</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--red)">${countAction('issue.')}</div><div class="stat-lbl">Problémy</div></div>
    </div>

    <div class="card" style="background:rgba(54,176,174,.08);border:1px solid rgba(54,176,174,.25)">
      <div class="card-title">ℹ️ Co se audituje</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Zápis počtů, změny stavů, úpravy zakázky, program stanoviště, poznámky a problémy.
        V Supabase Auth režimu se audit pokusí uložit také do tabulky <b>audit_logs</b>.
      </div>
    </div>

    ${rows.length === 0
      ? `<div class="card" style="text-align:center;color:var(--text2);padding:26px">Zatím nejsou uložené žádné auditní události.</div>`
      : rows.map(auditLogHtml).join('')}
  `;
}

function auditLogHtml(row) {
  const role = row.role ? ROLE_LABELS[row.role] : 'systém';
  const actionLabel = {
    'auth.mode_changed': 'Režim přihlášení',
    'auth.login': 'Přihlášení',
    'station.counts_saved': 'Počty uloženy',
    'station.counts_reset': 'Počty reset',
    'station.completed': 'Stanoviště hotovo',
    'station.status_changed': 'Stav změněn',
    'station.program_updated': 'Program upraven',
    'order.info_updated': 'Zakázka upravena',
    'order.blocked': 'Zakázka blokována',
    'order.unblocked': 'Zakázka odblokována',
    'order.deleted': 'Zakázka smazána',
    'note.created': 'Poznámka přidána',
    'note.deleted': 'Poznámka smazána',
    'scrap.removed': 'Zmetek vyjmut',
    'issue.created': 'Problém nahlášen',
    'issue.resolved': 'Problém vyřešen',
  }[row.action] || row.action;
  return `<div class="card" style="border-left:4px solid var(--teal)">
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:8px">
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text)">${escapeHtml(actionLabel)}</div>
        <div style="font-size:11px;color:var(--text2)">${escapeHtml(row.entityType)} · ${escapeHtml(row.entityId)}</div>
      </div>
      <span class="badge" style="background:rgba(54,176,174,.14);color:var(--teal)">${escapeHtml(role)}</span>
    </div>
    <div style="font-size:12px;color:var(--text);line-height:1.45;margin-bottom:8px">${escapeHtml(row.summary)}</div>
    <div style="font-size:11px;color:var(--text3)">
      🕒 ${formatDateTime(row.at)} · 👤 ${escapeHtml(row.userName || 'Systém')}
    </div>
  </div>`;
}

function renderAdminLupaNet() {
  const api = window.EZOP4_LUPA_NET;
  const config = api?.readLupaNetConfig?.() || {
    enabled: false,
    mode: 'disabled',
    direction: 'export_progress',
    apiBaseUrl: '',
    companyCode: '',
    orderNumberField: 'cislo_zakazky',
    productCodeField: 'kod_vyrobku',
  };
  const readiness = api?.lupaNetReadiness?.(config) || [];
  const readyCount = readiness.filter(item => item.ok).length;
  const fieldMap = api?.LUPA_NET_FIELD_MAP || [];
  return `
    <div class="card" style="border-left:4px solid var(--teal)">
      <div class="card-title">🔌 Připravenost na Lupa NET</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.55">
        Veřejná dokumentace Lupa NET nepopisuje konkrétní API endpointy, proto je EZOP4 připravený
        přes oddělený konektor. Jakmile dodavatel předá API/CSV specifikaci, doplní se pouze adaptér,
        ne výrobní obrazovky.
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val">${readyCount}/${readiness.length}</div><div class="stat-lbl">Kontrol připraveno</div></div>
      <div class="stat-card"><div class="stat-val">${ORDERS.length}</div><div class="stat-lbl">Zakázek pro export</div></div>
      <div class="stat-card"><div class="stat-val">${config.mode.toUpperCase()}</div><div class="stat-lbl">Režim</div></div>
    </div>

    <div class="card">
      <div class="card-title">⚙️ Konfigurace propojení</div>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px;font-size:13px;color:var(--text)">
        <input type="checkbox" id="ln-enabled" ${config.enabled ? 'checked' : ''}>
        Integrace Lupa NET je připravená k testování
      </label>
      <div class="input-group">
        <div class="input-label">Režim</div>
        <select class="input" id="ln-mode">
          <option value="disabled" ${config.mode === 'disabled' ? 'selected' : ''}>Vypnuto</option>
          <option value="csv" ${config.mode === 'csv' ? 'selected' : ''}>CSV/JSON soubory</option>
          <option value="api" ${config.mode === 'api' ? 'selected' : ''}>API konektor</option>
        </select>
      </div>
      <div class="input-group">
        <div class="input-label">Směr toku dat</div>
        <select class="input" id="ln-direction">
          <option value="export_progress" ${config.direction === 'export_progress' ? 'selected' : ''}>EZOP4 → Lupa NET: průběh výroby</option>
          <option value="import_orders" ${config.direction === 'import_orders' ? 'selected' : ''}>Lupa NET → EZOP4: zakázky</option>
          <option value="bidirectional" ${config.direction === 'bidirectional' ? 'selected' : ''}>Obousměrně</option>
        </select>
      </div>
      <div class="input-group">
        <div class="input-label">URL Lupa NET konektoru / middleware</div>
        <input class="input" id="ln-api-url" placeholder="např. https://intranet/lupanet-bridge" value="${escapeHtml(config.apiBaseUrl || '')}">
      </div>
      <div class="input-group">
        <div class="input-label">Kód firmy / střediska v Lupa NET</div>
        <input class="input" id="ln-company-code" placeholder="doplní dodavatel Lupa NET" value="${escapeHtml(config.companyCode || '')}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="input-group">
          <div class="input-label">Pole čísla zakázky</div>
          <input class="input" id="ln-order-field" value="${escapeHtml(config.orderNumberField || 'cislo_zakazky')}">
        </div>
        <div class="input-group">
          <div class="input-label">Pole kódu výrobku</div>
          <input class="input" id="ln-product-field" value="${escapeHtml(config.productCodeField || 'kod_vyrobku')}">
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
        <button class="btn btn-primary" onclick="saveLupaNetConfig()">💾 Uložit konfiguraci</button>
        <button class="btn btn-ghost" onclick="exportLupaNetPackage()">📤 Stáhnout export pro Lupa NET</button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">✅ Kontrola připravenosti</div>
      ${readiness.map(item => ezop4ChecklistRow(item.label, item.detail, item.ok)).join('')}
    </div>

    <div class="card">
      <div class="card-title">🧭 Mapování dat</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.45;margin-bottom:10px">
        Toto je výchozí návrh polí pro dodavatele Lupa NET. Názvy lze změnit podle skutečné importní šablony/API.
      </div>
      <table class="tbl">
        <thead><tr><th>EZOP4 pole</th><th>Lupa NET pole</th><th>Význam</th></tr></thead>
        <tbody>
          ${fieldMap.map(([source, target, label]) => `
            <tr><td>${escapeHtml(source)}</td><td style="color:var(--gold)">${escapeHtml(target)}</td><td>${escapeHtml(label)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="card" style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25)">
      <div class="card-title">📌 Co potřebujeme od dodavatele Lupa NET</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.55">
        1. Zda je podporované API, nebo jen import/export soubory.<br>
        2. Přesné názvy polí pro zakázku, výrobek, množství, stav a sklad.<br>
        3. Identifikátor firmy/střediska/skladu.<br>
        4. Autentizaci konektoru a doporučenou periodu synchronizace.<br>
        5. Pravidlo, zda se do Lupa NET posílají průběžné stavy, nebo až hotové kusy.
      </div>
    </div>
  `;
}

function renderAdminCloud() {
  const url = localStorage.getItem('vyrobais_supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('vyrobais_supabase_key') || DEFAULT_SUPABASE_KEY;
  const connected = db !== null;
  return `
    <div class="card" style="background:${connected?'rgba(34,197,94,.08)':'var(--card)'};border:1px solid ${connected?'var(--green)':'var(--border)'}">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:24px">${connected?'✅':'☁️'}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700;color:${connected?'var(--green)':'var(--text)'}">
            ${connected ? 'Připojeno k Supabase' : 'Cloud zatím nepřipojen'}
          </div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">
            ${connected
              ? 'Data se synchronizují se sdílenou databází.'
              : 'Aplikace ukládá data lokálně do prohlížeče. Pro sdílení mezi zařízeními a uživateli připojte Supabase.'}
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3)">
      <div class="card-title">🔐 Bezpečnost cloud režimu</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Aktuální statická verze už neposílá do cloudu hesla, profily uživatelů ani logy přihlášení.
        Pro ostrý provoz je ale potřeba serverová autorizace: Python/FastAPI backend nebo Supabase Auth + RLS podle rolí.
      </div>
    </div>

    <div class="card">
      <div class="card-title">🔗 Konfigurace Supabase</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.5">
        1. Vytvořte si projekt na <span style="color:var(--gold)">supabase.com</span> (zdarma)<br>
        2. SQL Editor → spusťte schema.sql z GitHub repa<br>
        3. Settings → API → zkopírujte URL a anon key níže
      </div>

      <div class="input-group">
        <div class="input-label">Project URL</div>
        <input class="input" id="cloud-url" placeholder="https://xxxxx.supabase.co" value="${escapeHtml(url)}">
      </div>
      <div class="input-group">
        <div class="input-label">Anon (public) key</div>
        <input class="input" id="cloud-key" placeholder="eyJhbGciOiJI..." value="${escapeHtml(key)}">
      </div>

      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="saveCloudConfig()">💾 Uložit a připojit</button>
        ${connected ? `<button class="btn btn-ghost" onclick="disconnectCloud()">Odpojit</button>` : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">💾 Lokální data</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
        Data uložená v tomto prohlížeči (zakázky, problémy, poznámky, profily uživatelů bez hesel). Hesla jsou oddělená lokálně a neposílají se do cloudu ani exportu.
      </div>
      <button class="btn btn-danger btn-sm" onclick="resetState()">🗑️ Vymazat lokální data</button>
      <button class="btn btn-ghost btn-sm" onclick="exportData()" style="margin-left:6px">📤 Export JSON</button>
      <button class="btn btn-ghost btn-sm" onclick="cleanupAppMemoryFromAdmin()" style="margin-left:6px">🧹 Vyčistit dočasnou paměť</button>
    </div>

    <div class="card">
      <div class="card-title">📱 Instalovat jako aplikaci</div>
      <div style="font-size:12px;color:var(--text);line-height:1.6">
        <b>Android / desktop Chrome:</b> ⋮ menu → "Instalovat aplikaci"<br>
        <b>iOS Safari:</b> ↑ Sdílet → "Přidat na plochu"<br>
        Po instalaci se VýrobaIS spouští jako samostatná aplikace.
      </div>
    </div>
  `;
}

window.saveCloudConfig = function() {
  const url = document.getElementById('cloud-url').value.trim();
  const key = document.getElementById('cloud-key').value.trim();
  if (!url || !key) { showToast('⚠️ Vyplňte URL i klíč'); return; }
  localStorage.setItem('vyrobais_supabase_url', url);
  localStorage.setItem('vyrobais_supabase_key', key);
  showToast('✅ Uloženo, restartuji…');
  setTimeout(() => location.reload(), 700);
};

window.disconnectCloud = function() {
  localStorage.removeItem('vyrobais_supabase_url');
  localStorage.removeItem('vyrobais_supabase_key');
  showToast('Cloud odpojen, restartuji…');
  setTimeout(() => location.reload(), 700);
};

window.exportData = function() {
  const data = {
    ...localState(),
    LOGIN_LOGS: [],
    exportedAt: new Date().toISOString(),
    exportNote: 'Export neobsahuje hesla ani lokální přihlašovací logy.',
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vyrobais-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('✅ Export stažen');
};

window.exportEzop4Tables = function() {
  const tableExport = window.EZOP4_TO_TABLES?.(currentState());
  if (!tableExport) {
    showToast('⚠️ Migrační modul není načtený');
    return;
  }
  const payload = {
    format: 'ezop4-table-export',
    version: window.__EZOP4_VERSION__ || '0.1.0',
    exportedAt: new Date().toISOString(),
    source: 'local app_state compatibility mode',
    note: 'Export neobsahuje hesla, lokální přihlašovací logy ani demo profily uživatelů.',
    tables: tableExport,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ezop4-table-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  showToast('✅ Ezop4 table export stažen');
};

window.showEzop4SchemaHelp = function() {
  openModal('Ezop4: spuštění schema.sql', `
    <div style="font-size:13px;color:var(--text2);line-height:1.6">
      <b style="color:var(--text)">1.</b> Otevřete Supabase projekt.<br>
      <b style="color:var(--text)">2.</b> V levém menu zvolte <b>SQL Editor</b> → <b>New query</b>.<br>
      <b style="color:var(--text)">3.</b> Vložte obsah souboru <b>schema.sql</b> z projektu Ezop4.<br>
      <b style="color:var(--text)">4.</b> Spusťte dotaz a potom vytvořte účty v <b>Authentication</b>.<br>
      <b style="color:var(--text)">5.</b> Uživatelům přiřaďte role v tabulce <b>profiles</b>.
    </div>
    <div style="margin-top:12px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:8px;padding:10px;font-size:12px;color:var(--text2);line-height:1.45">
      Ostrý provoz bude bezpečný až po přepnutí loginu na Supabase Auth a po čtení dat z tabulek místo kompatibilního app_state režimu.
    </div>
  `, [
    { label:'Rozumím', action:'closeModal()', cls:'btn-primary' },
  ]);
};

window.setEzop4AuthModeFromAdmin = function(mode) {
  const nextMode = mode === 'supabase' ? 'supabase' : 'demo';
  const before = { mode: ezop4AuthMode() };
  setEzop4AuthMode(nextMode);
  writeAudit(
    'auth.mode_changed',
    'app_settings',
    'ezop4-auth-mode',
    `Režim přihlášení změněn na ${nextMode === 'supabase' ? 'Supabase Auth' : 'Demo login'}`,
    before,
    { mode: nextMode },
  );
  renderAdmin();
  showToast(nextMode === 'supabase'
    ? 'Supabase Auth režim zapnutý, demo login zůstává fallback.'
    : 'Demo login režim zapnutý.');
};

window.saveLupaNetConfig = function() {
  const api = window.EZOP4_LUPA_NET;
  if (!api?.writeLupaNetConfig) {
    showToast('⚠️ Modul Lupa NET není načtený');
    return;
  }
  const config = {
    enabled: Boolean(document.getElementById('ln-enabled')?.checked),
    mode: document.getElementById('ln-mode')?.value || 'disabled',
    direction: document.getElementById('ln-direction')?.value || 'export_progress',
    apiBaseUrl: document.getElementById('ln-api-url')?.value.trim() || '',
    companyCode: document.getElementById('ln-company-code')?.value.trim() || '',
    orderNumberField: document.getElementById('ln-order-field')?.value.trim() || 'cislo_zakazky',
    productCodeField: document.getElementById('ln-product-field')?.value.trim() || 'kod_vyrobku',
    lastSyncAt: api.readLupaNetConfig?.().lastSyncAt,
  };
  api.writeLupaNetConfig(config);
  writeAudit(
    'integration.lupanet_config_saved',
    'app_settings',
    'lupanet',
    `Konfigurace Lupa NET uložena: ${config.mode}`,
    null,
    { ...config, apiBaseUrl: config.apiBaseUrl ? '(nastaveno)' : '' },
  );
  renderAdmin();
  showToast('Konfigurace Lupa NET uložena');
};

window.exportLupaNetPackage = function() {
  const api = window.EZOP4_LUPA_NET;
  if (!api?.buildLupaNetPackage) {
    showToast('⚠️ Modul Lupa NET není načtený');
    return;
  }
  const config = api.readLupaNetConfig?.();
  const payload = api.buildLupaNetPackage(currentState(), config);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ezop4-lupanet-export-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  writeAudit(
    'integration.lupanet_export_created',
    'integration_export',
    'lupanet',
    `Export pro Lupa NET vytvořen: ${payload.orders.length} zakázek`,
    null,
    { orderCount: payload.orders.length, mode: payload.config.mode, direction: payload.config.direction },
  );
  showToast('✅ Export pro Lupa NET stažen');
};

window.cleanupAppMemoryFromAdmin = function() {
  const stats = cleanupAppMemory({ persist: true, clearLoginGuard: true });
  renderAdmin();
  showToast(`Vyčištěno: poznámky ${stats.removedNotes}, logy ${stats.removedLogs}, paměť výrobků ${stats.removedMemory}`);
};

window.clearAuditLogFromAdmin = function() {
  if (!confirm('Opravdu vymazat lokální audit v tomto prohlížeči?')) return;
  clearAuditRows();
  renderAdmin();
  showToast('Audit log vymazán');
};

function switchAdminTab(tab) { adminTab = tab; renderAdmin(); }

function renderAdminUsers() {
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div style="font-size:13px;color:var(--text2)">${USERS.length} uživatelů v systému</div>
    <button class="btn btn-primary btn-sm" onclick="newUserModal()">+ Přidat uživatele</button>
  </div>
  ${USERS.map(u => `
    <div class="user-card">
      <div class="user-avatar" style="background:${escapeHtml(u.color)}22;color:${escapeHtml(u.color)}">${escapeHtml(u.avatar)}</div>
      <div class="user-info">
        <div class="user-name">${escapeHtml(u.name)}</div>
        <div class="user-login" style="color:var(--text3)">Login: <b style="color:var(--text2)">${escapeHtml(u.login)}</b> · Heslo: <b style="color:var(--text2)">skryté lokálně</b></div>
      </div>
      <span class="role-badge role-${u.role}">${ROLE_LABELS[u.role]}</span>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-sm" title="Upravit uživatele" onclick="editUserModal('${u.id}')">✏️</button>
        <button class="btn btn-danger btn-sm" title="Smazat uživatele" onclick="deleteUserModal('${u.id}')">🗑️</button>
      </div>
    </div>`).join('')}`;
}

function renderAdminLoginLogs() {
  const okCount = LOGIN_LOGS.filter(log => log.success).length;
  const failCount = LOGIN_LOGS.filter(log => !log.success).length;
  const rows = LOGIN_LOGS.slice(0, 80);
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap">
      <div style="font-size:13px;color:var(--text2)">
        Admin vidí posledních ${rows.length} záznamů přihlášení uložených v této instalaci/prohlížeči.
      </div>
      <button class="btn btn-danger btn-sm" onclick="clearLoginLogs()">Vymazat logy</button>
    </div>

    <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--text2);line-height:1.45">
      Demo verze běží bez serveru, proto neumí sama zjistit interní IP adresu uživatele. V produkční interní síti by se stejný log ukládal serverově do databáze včetně IP adresy, případně jména zařízení.
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="stat-val" style="color:var(--green)">${okCount}</div><div class="stat-lbl">Úspěšná přihlášení</div></div>
      <div class="stat-card"><div class="stat-val" style="color:var(--red)">${failCount}</div><div class="stat-lbl">Neúspěšné pokusy</div></div>
      <div class="stat-card"><div class="stat-val">${LOGIN_LOGS.length}</div><div class="stat-lbl">Záznamů celkem</div></div>
    </div>

    ${rows.length === 0
      ? `<div class="card" style="text-align:center;color:var(--text2);padding:26px">Zatím nejsou uložené žádné logy přihlášení.</div>`
      : rows.map(loginLogHtml).join('')}
  `;
}

function loginLogHtml(log) {
  const source = log.source || {};
  const statusColor = log.success ? 'var(--green)' : 'var(--red)';
  const statusText = log.success ? 'Úspěšné přihlášení' : 'Neúspěšný pokus';
  const role = log.role ? ROLE_LABELS[log.role] : 'bez role';
  return `<div class="card" style="border-left:4px solid ${statusColor}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
      <div>
        <div style="font-size:14px;font-weight:800;color:var(--text)">${escapeHtml(log.name)}</div>
        <div style="font-size:11px;color:var(--text2)">Login: <b>${escapeHtml(log.login)}</b> · ${escapeHtml(role)}</div>
      </div>
      <span class="badge" style="background:${log.success ? 'rgba(34,197,94,.14)' : 'rgba(239,68,68,.14)'};color:${statusColor}">${statusText}</span>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:6px">
      🕒 ${formatDateTime(log.at)}
    </div>
    <div style="background:var(--card2);border-radius:8px;padding:9px 10px;font-size:11px;color:var(--text2);line-height:1.45">
      <div><b style="color:var(--text)">Odkud:</b> ${escapeHtml(source.host || '-')}</div>
      <div><b style="color:var(--text)">Zařízení:</b> ${escapeHtml(source.device || '-')} · ${escapeHtml(source.screen || '-')}</div>
      <div><b style="color:var(--text)">Jazyk / zóna:</b> ${escapeHtml(source.language || '-')} · ${escapeHtml(source.timezone || '-')}</div>
      <div style="word-break:break-word"><b style="color:var(--text)">Prohlížeč:</b> ${escapeHtml(shortBrowser(source.browser || '-'))}</div>
    </div>
  </div>`;
}

function clearLoginLogs() {
  if (!confirm('Opravdu vymazat logy přihlášení v tomto prohlížeči?')) return;
  LOGIN_LOGS = [];
  saveLoginLogs();
  renderAdmin();
  showToast('Logy přihlášení vymazány');
}

function shortBrowser(ua) {
  return ua.length > 140 ? ua.slice(0, 140) + '...' : ua;
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderAdminSettings() {
  return Object.entries({
    companyName:        { label:'Název firmy', desc:'Zobrazuje se v záhlaví aplikace', type:'text' },
    lockTimeout:        { label:'Timeout zamčení (hod)', desc:'Po jaké době neaktivity se zamkne', type:'number' },
    showKpiOperator:    { label:'KPI pro operátory', desc:'Operátoři vidí KPI záložku', type:'toggle' },
    requireNoteOnIssue: { label:'Poznámka povinná u problému', desc:'Při nahlášení problému vyžadovat text', type:'toggle' },
    notifyOnIssue:      { label:'Notifikovat při problému', desc:'Zasílat notifikace mistrovi', type:'toggle' },
    shiftHours:         { label:'Délka směny (hod)', desc:'Pro výpočet KPI a kapacity', type:'number' },
  }).map(([key, cfg]) => `
    <div class="settings-row">
      <div>
        <div class="settings-label">${cfg.label}</div>
        <div class="settings-desc">${cfg.desc}</div>
      </div>
      ${cfg.type === 'toggle'
        ? `<div class="toggle ${APP_SETTINGS[key]?'on':''}" onclick="toggleSetting('${key}')"></div>`
        : `<input class="input" style="width:140px" type="${cfg.type}" value="${APP_SETTINGS[key]}"
             onchange="APP_SETTINGS['${key}']=(this.type==='number'?Number(this.value):this.value);showToast('Uloženo')">`
      }
    </div>`).join('');
}

function toggleSetting(key) {
  APP_SETTINGS[key] = !APP_SETTINGS[key];
  renderAdmin();
  showToast('Nastavení uloženo');
}

function renderAdminStations() {
  return `<div style="font-size:13px;color:var(--text2);margin-bottom:12px">Správa výrobních stanovišť</div>
  ${STATIONS.map(st => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--card2);
      border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px">
      <span style="font-size:20px">${st.icon}</span>
      <span style="flex:1;font-size:13px;font-weight:600">${st.id}. ${st.name}</span>
      <button class="btn btn-ghost btn-sm" onclick="editStationModal(${st.id})">✏️ Upravit</button>
    </div>`).join('')}`;
}

function renderAdminOrders() {
  return `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div style="font-size:13px;color:var(--text2)">${ORDERS.length} zakázek</div>
    <button class="btn btn-primary btn-sm" onclick="newOrderModal()">+ Nová zakázka</button>
  </div>
  ${[...ORDERS].sort((a,b)=>a.number.localeCompare(b.number)).map(o => `
    <div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--card2);
      border:1px solid var(--border);border-radius:var(--radius);margin-bottom:6px">
      <div style="font-family:'SF Mono',Menlo,monospace;font-size:14px;font-weight:800;color:var(--gold);min-width:62px">${o.number}</div>
      <div style="flex:1">
        <div style="font-size:12px;color:var(--teal2);font-weight:600">${o.customer}</div>
        <div style="font-size:13px;font-weight:700">${o.name}</div>
        <div style="font-size:11px;color:var(--text2)">${o.qty} ks · ${formatDate(o.due)}</div>
      </div>
      <span class="badge badge-${o.priority}">${priorityLabel(o.priority)}</span>
      <button class="btn btn-ghost btn-sm" onclick="editOrderModal('${o.id}')">✏️</button>
      ${can('delete_order') ? `<button class="btn btn-danger btn-sm" onclick="deleteOrderModal('${o.id}')">🗑️</button>` : ''}
    </div>`).join('')}`;
}

// ── MŮJ PROSTOR ──────────────────────────────────────
let workspaceTab = 'notes';

function myWorkspace() {
  const uid = currentUser?.id;
  if (!uid) return { notes: [], myBoards: [], attendance: [] };
  if (!USER_WORKSPACE[uid]) {
    USER_WORKSPACE[uid] = { notes: [], myBoards: [], attendance: [] };
  }
  const ws = USER_WORKSPACE[uid];
  if (!Array.isArray(ws.notes))      ws.notes      = [];
  if (!Array.isArray(ws.myBoards))   ws.myBoards   = [];
  if (!Array.isArray(ws.attendance)) ws.attendance = [];
  return ws;
}

function renderWorkspace() {
  const tabs = [
    { id: 'notes',      label: '📝 Poznámky'  },
    { id: 'boards',     label: '🔢 Moje kusy' },
    { id: 'attendance', label: '🕐 Docházka'  },
  ];
  document.getElementById('page-workspace').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0 8px;gap:8px;flex-wrap:wrap">
      <div style="font-size:16px;font-weight:800;color:var(--gold)">📒 Můj prostor</div>
      <button class="btn btn-ghost btn-sm" onclick="exportMyWorkspaceCsv()">📥 Export CSV</button>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:14px">
      ${tabs.map(t => `
        <button class="btn ${workspaceTab === t.id ? 'btn-primary' : 'btn-ghost'} btn-sm"
          style="flex:1;justify-content:center;font-size:12px"
          onclick="switchWorkspaceTab('${t.id}')">${t.label}</button>
      `).join('')}
    </div>
    <div id="workspace-content"></div>
  `;
  renderWorkspaceContent();
}

function exportMyWorkspaceCsv() {
  const ws = myWorkspace();
  const stamp = new Date().toISOString().slice(0, 10);

  if (workspaceTab === 'notes') {
    const rows = [['Kategorie', 'Text', 'Vytvořeno']];
    [...ws.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .forEach(n => rows.push([NOTE_CATEGORIES[n.category] || n.category, n.text, formatDateTime(n.createdAt)]));
    downloadCsv(`moje-poznamky-${stamp}.csv`, rows);
    return;
  }
  if (workspaceTab === 'boards') {
    const rows = [['Zakázka', 'Výrobek', 'OK', 'Oprava', 'Zmetek', 'Poznámka', 'Zaznamenáno']];
    [...ws.myBoards].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .forEach(b => rows.push([b.orderNumber, b.orderName, b.qtyOk, b.qtyRework, b.qtyScrap, b.note || '', formatDateTime(b.recordedAt)]));
    downloadCsv(`moje-kusy-${stamp}.csv`, rows);
    return;
  }
  if (workspaceTab === 'attendance') {
    const rows = [['Datum', 'Příchod', 'Odchod', 'Minuty']];
    [...ws.attendance].sort((a, b) => b.date.localeCompare(a.date)).forEach(a => {
      const mins = a.checkIn && a.checkOut
        ? Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 60000) : '';
      rows.push([a.date, a.checkIn ? formatTime(a.checkIn) : '', a.checkOut ? formatTime(a.checkOut) : '', mins]);
    });
    downloadCsv(`moje-dochazka-${stamp}.csv`, rows);
    return;
  }
}

function switchWorkspaceTab(tab) {
  workspaceTab = tab;
  renderWorkspace();
}

function renderWorkspaceContent() {
  const el = document.getElementById('workspace-content');
  if (!el) return;
  if      (workspaceTab === 'notes')      el.innerHTML = renderWorkspaceNotes();
  else if (workspaceTab === 'boards')     el.innerHTML = renderWorkspaceBoards();
  else if (workspaceTab === 'attendance') el.innerHTML = renderWorkspaceAttendance();
}

// ── POZNÁMKY ──────────────────────────────────────────
const NOTE_CATEGORIES = { general: 'Obecné', product: 'Výrobek', other: 'Jiné' };

function renderWorkspaceNotes() {
  const notes = [...myWorkspace().notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const catColors = { general: 'var(--blue,#60a5fa)', product: 'var(--gold)', other: 'var(--text2)' };
  return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="openAddNoteModal()">＋ Nová poznámka</button>
    </div>
    ${notes.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--text2);padding:32px 16px">
        <div style="font-size:32px;margin-bottom:8px">📝</div>
        <div>Zatím žádné poznámky. Přidej svou první!</div>
      </div>` : notes.map(n => `
      <div class="card" style="margin-bottom:10px;position:relative">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
          <span style="font-size:11px;font-weight:700;color:${catColors[n.category] || 'var(--text2)'};text-transform:uppercase;letter-spacing:.5px">
            ${NOTE_CATEGORIES[n.category] || n.category}
          </span>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;color:var(--red)"
            onclick="deleteWorkspaceNote('${escapeHtml(n.id)}')">🗑️</button>
        </div>
        <div style="font-size:14px;color:var(--text);white-space:pre-wrap;margin:6px 0 8px">${escapeHtml(n.text)}</div>
        <div style="font-size:11px;color:var(--text3)">${formatDateTime(n.createdAt)}</div>
      </div>`).join('')}
  `;
}

function openAddNoteModal() {
  openModal('📝 Nová poznámka', `
    <div class="input-group">
      <div class="input-label">Kategorie</div>
      <select class="input" id="note-cat">
        ${Object.entries(NOTE_CATEGORIES).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
    </div>
    <div class="input-group">
      <div class="input-label">Text poznámky</div>
      <textarea class="input" id="note-text" rows="5" placeholder="Napiš cokoliv…"
        style="resize:vertical;min-height:100px"></textarea>
    </div>
  `, [
    { label: '✕ Zrušit', cls: 'btn-ghost', action: 'closeModal()' },
    { label: '✔ Uložit', cls: 'btn-primary', action: 'saveWorkspaceNote()' },
  ]);
}

function saveWorkspaceNote() {
  const text = document.getElementById('note-text')?.value?.trim();
  if (!text) { showToast('⚠️ Poznámka je prázdná'); return; }
  const cat  = document.getElementById('note-cat')?.value || 'general';
  const ws   = myWorkspace();
  ws.notes.push({ id: 'ws' + Date.now() + Math.random().toString(36).slice(2,6), text, category: cat, createdAt: new Date().toISOString() });
  saveState();
  closeModal();
  showToast('✅ Poznámka uložena');
  renderWorkspaceContent();
}

function deleteWorkspaceNote(id) {
  const ws = myWorkspace();
  ws.notes = ws.notes.filter(n => n.id !== id);
  saveState();
  showToast('🗑️ Poznámka smazána');
  renderWorkspaceContent();
}

// ── MOJE KUSY ─────────────────────────────────────────
function renderWorkspaceBoards() {
  const boards = [...myWorkspace().myBoards].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return `
    <div style="display:flex;justify-content:flex-end;margin-bottom:10px">
      <button class="btn btn-primary btn-sm" onclick="openAddBoardsModal()">＋ Přidat záznam</button>
    </div>
    ${boards.length === 0 ? `
      <div class="card" style="text-align:center;color:var(--text2);padding:32px 16px">
        <div style="font-size:32px;margin-bottom:8px">🔢</div>
        <div>Zatím žádné záznamy o kusech.</div>
      </div>` : boards.map(b => `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(b.orderNumber)} · ${escapeHtml(b.orderName)}</div>
            <div style="font-size:11px;color:var(--text3)">${formatDateTime(b.recordedAt)}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;color:var(--red)"
            onclick="deleteWorkspaceBoard('${escapeHtml(b.id)}')">🗑️</button>
        </div>
        <div style="display:flex;gap:14px;font-size:12px;margin-bottom:${b.note ? 6 : 0}px">
          <span style="color:var(--green)">✅ OK: <b>${b.qtyOk}</b></span>
          <span style="color:var(--amber)">🔧 Oprava: <b>${b.qtyRework}</b></span>
          <span style="color:var(--red)">❌ Zmetek: <b>${b.qtyScrap}</b></span>
        </div>
        ${b.note ? `<div style="font-size:12px;color:var(--text2);white-space:pre-wrap">${escapeHtml(b.note)}</div>` : ''}
      </div>`).join('')}
  `;
}

function openAddBoardsModal() {
  const orderOpts = ORDERS.filter(o => o.stations?.length > 0).map(o =>
    `<option value="${escapeHtml(o.id)}">${escapeHtml(o.number)} · ${escapeHtml(o.name)}</option>`
  ).join('');
  if (!orderOpts) { showToast('⚠️ Žádné aktivní zakázky'); return; }
  openModal('🔢 Moje kusy', `
    <div class="input-group">
      <div class="input-label">Zakázka</div>
      <select class="input" id="board-order">${orderOpts}</select>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
      <div class="input-group">
        <div class="input-label">✅ OK</div>
        <input class="input" id="board-ok" type="number" min="0" value="0">
      </div>
      <div class="input-group">
        <div class="input-label">🔧 Oprava</div>
        <input class="input" id="board-rework" type="number" min="0" value="0">
      </div>
      <div class="input-group">
        <div class="input-label">❌ Zmetek</div>
        <input class="input" id="board-scrap" type="number" min="0" value="0">
      </div>
    </div>
    <div class="input-group">
      <div class="input-label">Poznámka (volitelné)</div>
      <input class="input" id="board-note" placeholder="např. ranní směna, stroj č.2…">
    </div>
  `, [
    { label: '✕ Zrušit',  cls: 'btn-ghost',   action: 'closeModal()' },
    { label: '✔ Uložit',  cls: 'btn-primary',  action: 'saveWorkspaceBoard()' },
  ]);
}

function saveWorkspaceBoard() {
  const orderId = document.getElementById('board-order')?.value;
  const order   = ORDERS.find(o => o.id === orderId);
  if (!order) { showToast('⚠️ Vyberte zakázku'); return; }
  const qtyOk    = Math.max(0, parseInt(document.getElementById('board-ok')?.value)    || 0);
  const qtyRework = Math.max(0, parseInt(document.getElementById('board-rework')?.value) || 0);
  const qtyScrap  = Math.max(0, parseInt(document.getElementById('board-scrap')?.value)  || 0);
  if (qtyOk + qtyRework + qtyScrap === 0) { showToast('⚠️ Zadej alespoň jeden nenulový počet'); return; }
  const note = document.getElementById('board-note')?.value?.trim() || '';
  const ws   = myWorkspace();
  ws.myBoards.push({
    id: 'ws' + Date.now() + Math.random().toString(36).slice(2,6), orderId, orderNumber: order.number, orderName: order.name,
    qtyOk, qtyRework, qtyScrap, note, recordedAt: new Date().toISOString(),
  });
  saveState();
  closeModal();
  showToast('✅ Záznam uložen');
  renderWorkspaceContent();
}

function deleteWorkspaceBoard(id) {
  const ws = myWorkspace();
  ws.myBoards = ws.myBoards.filter(b => b.id !== id);
  saveState();
  showToast('🗑️ Záznam smazán');
  renderWorkspaceContent();
}

// ── DOCHÁZKA ──────────────────────────────────────────
function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function todayAttendance() {
  const today = todayDateStr();
  return myWorkspace().attendance.find(a => a.date === today) || null;
}

function renderWorkspaceAttendance() {
  const today   = todayDateStr();
  const todayRec = todayAttendance();
  const past    = [...myWorkspace().attendance]
    .filter(a => a.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 30);

  const checkedIn  = todayRec && todayRec.checkIn && !todayRec.checkOut;
  const checkedOut = todayRec && todayRec.checkOut;

  let todayBlock;
  if (!todayRec || !todayRec.checkIn) {
    todayBlock = `
      <div style="text-align:center">
        <div style="font-size:13px;color:var(--text2);margin-bottom:12px">Dnes jsi se ještě nepřihlásil/a</div>
        <button class="btn btn-primary" style="width:100%;font-size:15px;padding:14px"
          onclick="workspaceCheckIn()">🟢 Příchod – zaznamenat</button>
      </div>`;
  } else if (checkedIn) {
    todayBlock = `
      <div style="text-align:center">
        <div style="font-size:13px;color:var(--green);font-weight:700;margin-bottom:4px">✅ Dnes přihlášen/a</div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:12px">Příchod: <b>${formatTime(todayRec.checkIn)}</b></div>
        <button class="btn btn-danger" style="width:100%;font-size:15px;padding:14px"
          onclick="workspaceCheckOut()">🔴 Odchod – zaznamenat</button>
      </div>`;
  } else {
    const mins = Math.round((new Date(todayRec.checkOut) - new Date(todayRec.checkIn)) / 60000);
    todayBlock = `
      <div style="text-align:center">
        <div style="font-size:13px;color:var(--text2);font-weight:700;margin-bottom:4px">Dnešní směna ukončena</div>
        <div style="font-size:12px;color:var(--text2)">
          Příchod: <b>${formatTime(todayRec.checkIn)}</b> · Odchod: <b>${formatTime(todayRec.checkOut)}</b>
          · Odpracováno: <b>${Math.floor(mins/60)}h ${mins%60}m</b>
        </div>
      </div>`;
  }

  const historyRows = past.map(a => {
    const mins = a.checkIn && a.checkOut
      ? Math.round((new Date(a.checkOut) - new Date(a.checkIn)) / 60000)
      : null;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
        <span style="font-size:13px;color:var(--text)">${formatDate(a.date)}</span>
        <span style="font-size:12px;color:var(--text2)">
          ${a.checkIn ? formatTime(a.checkIn) : '–'} → ${a.checkOut ? formatTime(a.checkOut) : '⏳'}
          ${mins !== null ? `<b style="color:var(--text);margin-left:6px">${Math.floor(mins/60)}h ${mins%60}m</b>` : ''}
        </span>
      </div>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-title">📅 Dnes – ${formatDate(today)}</div>
      ${todayBlock}
    </div>
    ${past.length > 0 ? `
    <div class="card">
      <div class="card-title">📋 Posledních 30 dní</div>
      ${historyRows}
    </div>` : ''}
  `;
}

function workspaceCheckIn() {
  const ws    = myWorkspace();
  const today = todayDateStr();
  if (ws.attendance.find(a => a.date === today)) return;
  ws.attendance.push({ id: 'ws' + Date.now() + Math.random().toString(36).slice(2,6), date: today, checkIn: new Date().toISOString(), checkOut: null });
  saveState();
  showToast('🟢 Příchod zaznamenán');
  refreshAfterWorkspaceMutation();
}

function workspaceCheckOut(options = {}) {
  const ws  = myWorkspace();
  const rec = ws.attendance.find(a => a.date === todayDateStr());
  if (!rec || rec.checkOut) return;
  rec.checkOut = new Date().toISOString();
  saveState();
  showToast('🔴 Odchod zaznamenán');
  refreshAfterWorkspaceMutation();
  if (!options.skipHandoverPrompt) openShiftHandoverPrompt();
}

// ── PŘEDÁNÍ SMĚNY ────────────────────────────────────
function openShiftHandoverPrompt() {
  if (!currentUser) return;
  openModal('🔄 Předání směny (volitelné)', `
    <div style="font-size:13px;color:var(--text2);margin-bottom:10px;line-height:1.5">
      Krátká zpráva pro další směnu – co se dělalo, kde stojíš, na co dát pozor.
      Můžeš nechat prázdné a kliknout Přeskočit.
    </div>
    <textarea class="input" id="handover-text" rows="5"
      placeholder="např. „Stencil 3/0042 – dokončeno 80 ks, zbytek na stolu u stanice 2. Dnešní pasta dochází."
      style="resize:vertical;min-height:120px"></textarea>
  `, [
    { label: '⏭️ Přeskočit', cls: 'btn-ghost',   action: 'closeModal()' },
    { label: '✔ Předat',     cls: 'btn-primary', action: 'saveShiftHandover()' },
  ]);
  setTimeout(() => document.getElementById('handover-text')?.focus(), 50);
}

function saveShiftHandover() {
  const text = document.getElementById('handover-text')?.value?.trim();
  if (!text) { closeModal(); return; }
  SHIFT_HANDOVERS.push({
    id: 'sh' + Date.now() + Math.random().toString(36).slice(2,6),
    userId: currentUser.id,
    userName: currentUser.name,
    role: currentUser.role,
    text,
    createdAt: new Date().toISOString(),
    viewedBy: [currentUser.id],
  });
  saveState();
  closeModal();
  showToast('✅ Předání uloženo pro další směnu');
}

function unseenHandovers(limit = 5) {
  const uid = currentUser?.id;
  if (!uid) return [];
  return SHIFT_HANDOVERS
    .filter(h => !Array.isArray(h.viewedBy) || !h.viewedBy.includes(uid))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

function markHandoverSeen(id) {
  const h = SHIFT_HANDOVERS.find(x => x.id === id);
  if (!h || !currentUser) return;
  if (!Array.isArray(h.viewedBy)) h.viewedBy = [];
  if (!h.viewedBy.includes(currentUser.id)) h.viewedBy.push(currentUser.id);
  saveState();
  if (document.getElementById('page-dashboard')?.classList.contains('active')) renderDashboard();
}

function shiftHandoverWidgetHtml() {
  const list = unseenHandovers(5);
  if (list.length === 0) return '';
  return `
    <div class="card" style="border-left:3px solid var(--blue,#60a5fa);margin-bottom:10px">
      <div class="card-title">🔄 Předání z poslední směny</div>
      ${list.map(h => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);position:relative">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
            <div style="font-size:12px;color:var(--text);font-weight:700">
              ${escapeHtml(h.userName)} <span style="color:var(--text3);font-weight:400">· ${ROLE_LABELS[h.role] || h.role}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--text3)">${formatDateTime(h.createdAt)}</span>
              <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px"
                title="Označit jako přečtené"
                onclick="markHandoverSeen('${escapeHtml(h.id)}')">✓</button>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text);white-space:pre-wrap;line-height:1.45">${escapeHtml(h.text)}</div>
        </div>`).join('')}
    </div>`;
}

function refreshAfterWorkspaceMutation() {
  if (document.getElementById('page-dashboard')?.classList.contains('active')) renderDashboard();
  if (document.getElementById('page-workspace')?.classList.contains('active')) renderWorkspaceContent();
  refreshAttendanceIndicator();
}

// ── GLOBÁLNÍ VYHLEDÁVÁNÍ (Cmd/Ctrl + K) ───────────────
let _globalSearchSelectedIdx = 0;
let _globalSearchResults = [];

function globalSearch(q) {
  const query = String(q || '').toLowerCase().trim();
  if (!query) return [];
  const results = [];

  ORDERS.forEach(o => {
    const haystack = `${o.number} ${o.name} ${o.customer || ''} ${o.purchaseOrderNumber || ''} ${o.stencilNumber || ''}`.toLowerCase();
    if (haystack.includes(query)) {
      results.push({
        type: 'order',
        icon: '📋',
        label: `${o.number} · ${o.name}`,
        sublabel: o.customer || 'Bez zákazníka',
        action: `closeGlobalSearch(); openOrder('${o.id.replace(/'/g, "\\'")}')`,
      });
    }
  });

  ISSUES.filter(i => !i.resolved).forEach(i => {
    if ((i.description || '').toLowerCase().includes(query) ||
        (i.reportedBy || '').toLowerCase().includes(query)) {
      const order = ORDERS.find(o => o.id === i.orderId);
      results.push({
        type: 'issue',
        icon: '⚠️',
        label: (i.description || '').slice(0, 60),
        sublabel: `${order ? order.number + ' · ' : ''}${i.reportedBy || ''}`,
        action: `closeGlobalSearch(); navigateTo('issues')`,
      });
    }
  });

  PROD_NOTES.forEach(n => {
    if ((n.text || '').toLowerCase().includes(query)) {
      const order = ORDERS.find(o => o.id === n.orderId);
      results.push({
        type: 'note',
        icon: '📝',
        label: (n.text || '').slice(0, 60),
        sublabel: `${order ? order.number + ' · ' : ''}${n.author || ''}`,
        action: order ? `closeGlobalSearch(); openOrder('${order.id.replace(/'/g, "\\'")}')` : 'closeGlobalSearch()',
      });
    }
  });

  (USERS || []).forEach(u => {
    const haystack = `${u.name} ${u.login}`.toLowerCase();
    if (haystack.includes(query)) {
      results.push({
        type: 'user',
        icon: u.avatar || '👤',
        label: u.name,
        sublabel: `${u.login} · ${ROLE_LABELS[u.role] || u.role}`,
        action: `closeGlobalSearch(); ${can('app_settings') ? "switchAdminTab('users');navigateTo('admin')" : "navigateTo('profile')"}`,
      });
    }
  });

  const ws = myWorkspace();
  ws.notes.forEach(n => {
    if ((n.text || '').toLowerCase().includes(query)) {
      results.push({
        type: 'mynote',
        icon: '📒',
        label: n.text.slice(0, 60),
        sublabel: `Moje poznámka · ${NOTE_CATEGORIES[n.category] || n.category}`,
        action: `closeGlobalSearch(); navigateTo('workspace'); switchWorkspaceTab('notes')`,
      });
    }
  });

  return results.slice(0, 30);
}

function openGlobalSearch() {
  _globalSearchSelectedIdx = 0;
  _globalSearchResults = [];
  openModal('🔎 Hledat napříč aplikací', `
    <input class="input" id="gs-input" placeholder="Zakázka, problém, poznámka, uživatel…"
      style="font-size:15px;padding:12px"
      oninput="updateGlobalSearchResults(this.value)"
      onkeydown="handleGlobalSearchKey(event)">
    <div id="gs-hint" style="font-size:11px;color:var(--text3);margin-top:6px">
      Tipy: čísla zakázek, jména, klíčová slova z poznámek · Šipky = pohyb · Enter = otevřít · Esc = zavřít
    </div>
    <div id="gs-results" style="margin-top:12px;max-height:50vh;overflow-y:auto"></div>
  `, [
    { label: '✕ Zavřít', cls: 'btn-ghost', action: 'closeGlobalSearch()' },
  ]);
  setTimeout(() => document.getElementById('gs-input')?.focus(), 50);
}

function closeGlobalSearch() {
  closeModal();
  _globalSearchResults = [];
}

function updateGlobalSearchResults(q) {
  _globalSearchResults = globalSearch(q);
  _globalSearchSelectedIdx = 0;
  renderGlobalSearchResults();
}

function renderGlobalSearchResults() {
  const el = document.getElementById('gs-results');
  if (!el) return;
  if (_globalSearchResults.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">Začni psát pro vyhledávání…</div>`;
    return;
  }
  el.innerHTML = _globalSearchResults.map((r, i) => `
    <div class="gs-row" data-idx="${i}"
      style="display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;cursor:pointer;
             ${i === _globalSearchSelectedIdx ? 'background:rgba(212,160,23,.15);border:1px solid var(--gold)' : 'border:1px solid transparent'}"
      onclick="${r.action}"
      onmouseenter="_globalSearchSelectedIdx=${i};renderGlobalSearchResults()">
      <div style="font-size:20px">${r.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.label)}</div>
        <div style="font-size:11px;color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(r.sublabel || '')}</div>
      </div>
      <span class="role-badge" style="font-size:9px;text-transform:uppercase">${r.type}</span>
    </div>`).join('');
}

function handleGlobalSearchKey(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    _globalSearchSelectedIdx = Math.min(_globalSearchSelectedIdx + 1, _globalSearchResults.length - 1);
    renderGlobalSearchResults();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    _globalSearchSelectedIdx = Math.max(_globalSearchSelectedIdx - 1, 0);
    renderGlobalSearchResults();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const r = _globalSearchResults[_globalSearchSelectedIdx];
    if (r) eval(r.action);
  } else if (e.key === 'Escape') {
    closeGlobalSearch();
  }
}

// Cmd+K / Ctrl+K opens global search
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    if (!currentUser) return;
    e.preventDefault();
    openGlobalSearch();
  }
});

// ── TOPBAR ATTENDANCE INDICATOR ───────────────────────
function refreshAttendanceIndicator() {
  const el = document.getElementById('tbar-attendance');
  if (!el || !currentUser) return;
  const rec = todayAttendance();
  if (rec?.checkIn && !rec.checkOut) {
    el.style.display = '';
    el.textContent = '🟢 ' + formatTime(rec.checkIn);
    el.style.background = 'rgba(34,197,94,.18)';
    el.style.color = 'var(--green)';
    el.title = 'Přihlášen od ' + formatTime(rec.checkIn) + ' · klikni pro Můj prostor';
  } else if (rec?.checkIn && rec?.checkOut) {
    el.style.display = '';
    el.textContent = '✅ Hotovo';
    el.style.background = 'rgba(153,153,153,.15)';
    el.style.color = 'var(--text2)';
    el.title = 'Dnešní směna ukončena';
  } else {
    el.style.display = 'none';
  }
}

// ── DASHBOARD WIDGET ──────────────────────────────────
function dashboardWorkspaceWidgetHtml() {
  if (!currentUser) return '';
  const ws       = myWorkspace();
  const todayRec = todayAttendance();
  const checkedIn  = todayRec && todayRec.checkIn && !todayRec.checkOut;
  const checkedOut = todayRec && todayRec.checkOut;

  let statusBlock;
  if (!todayRec || !todayRec.checkIn) {
    statusBlock = `
      <button class="btn btn-primary btn-sm" onclick="workspaceCheckIn()"
        style="padding:6px 14px">🟢 Příchod</button>`;
  } else if (checkedIn) {
    statusBlock = `
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--green);font-weight:700">
          🟢 Příchod ${formatTime(todayRec.checkIn)}
        </span>
        <button class="btn btn-danger btn-sm" onclick="workspaceCheckOut()"
          style="padding:6px 14px">🔴 Odchod</button>
      </div>`;
  } else {
    const mins = Math.round((new Date(todayRec.checkOut) - new Date(todayRec.checkIn)) / 60000);
    statusBlock = `
      <span style="font-size:12px;color:var(--text2)">
        ✅ Hotovo · ${Math.floor(mins/60)}h ${mins%60}m
      </span>`;
  }

  const noteCount  = ws.notes.length;
  const boardCount = ws.myBoards.length;

  return `
    <div class="card" style="border-left:3px solid var(--gold);margin-bottom:10px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px;min-width:0">
          <span style="font-size:22px">📒</span>
          <div>
            <div style="font-size:13px;font-weight:700;color:var(--text)">Můj prostor</div>
            <div style="font-size:11px;color:var(--text3)">
              📝 ${noteCount} ${noteCount === 1 ? 'poznámka' : 'pozn.'} · 🔢 ${boardCount} ${boardCount === 1 ? 'záznam' : 'zázn.'}
            </div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${statusBlock}
          <button class="btn btn-ghost btn-sm" onclick="navigateTo('workspace')"
            style="padding:6px 10px">→</button>
        </div>
      </div>
    </div>`;
}

// ── HELPERS (workspace) ───────────────────────────────
function formatTime(iso) {
  if (!iso) return '–';
  return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
}

// ── PROFILE ───────────────────────────────────────────
function renderProfile() {
  const u = currentUser;
  document.getElementById('page-profile').innerHTML = `
    <div style="padding:12px 0 8px;font-size:16px;font-weight:800;color:var(--gold)">👤 Profil</div>
    <div class="card" style="text-align:center;padding:28px">
      <div style="font-size:48px;margin-bottom:10px">${escapeHtml(u.avatar)}</div>
      <div style="font-size:20px;font-weight:800;color:var(--text);margin-bottom:4px">${escapeHtml(u.name)}</div>
      <span class="role-badge role-${u.role}" style="font-size:12px">${ROLE_LABELS[u.role]}</span>
      <div style="margin-top:14px;font-size:12px;color:var(--text2)">Login: <b>${escapeHtml(u.login)}</b></div>
    </div>

    <div class="card">
      <div class="card-title">🔐 Oprávnění role</div>
      ${[
        ['view_orders','Zobrazení zakázek'],
        ['edit_qty','Zadávání počtů kusů'],
        ['change_status','Změna stavu stanoviště'],
        ['create_order','Vytváření zakázek'],
        ['delete_order','Mazání zakázek'],
        ['manage_order_stations','Správa a pořadí stanovišť'],
        ['edit_order_info','Úprava údajů zakázky'],
        ['edit_product_memory','Programy a fotky výrobku'],
        ['view_kpi','Přístup ke KPI'],
        ['manage_users','Správa uživatelů'],
        ['app_settings','Nastavení aplikace'],
      ].map(([action, label]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:13px;color:var(--text)">${label}</span>
          <span style="font-size:13px">${can(action) ? '✅' : '🚫'}</span>
        </div>`).join('')}
    </div>

    <div style="margin-top:8px">
      <button class="btn btn-danger" style="width:100%" onclick="doLogout()">🚪 Odhlásit se</button>
    </div>
  `;
}

// ── MODALS ────────────────────────────────────────────
function openModal(title, body, actions) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-actions').innerHTML = actions.map(a =>
    `<button class="btn ${a.cls}" onclick="${a.action}">${a.label}</button>`
  ).join('');
  document.getElementById('modal-overlay').classList.add('visible');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
}

// ── HISTORICKÉ ÚDAJE PRO AUTOCOMPLETE ────────────────
function knownCustomers() {
  return [...new Set(ORDERS.map(o => o.customer).filter(Boolean))].sort();
}
function knownProducts(customer) {
  return [...new Set(
    ORDERS.filter(o => !customer || o.customer === customer).map(o => o.name).filter(Boolean)
  )].sort();
}

function refreshProductDatalist(customerValue) {
  const dl = document.getElementById('dl-products');
  if (!dl) return;
  const products = knownProducts(customerValue);
  // Build options safely via DOM API to prevent XSS
  dl.replaceChildren(...products.map(p => {
    const opt = document.createElement('option');
    opt.value = p;
    return opt;
  }));
}

function productKey(customer, name) {
  return `${String(customer || '').trim().toLowerCase()}::${String(name || '').trim().toLowerCase()}`;
}

function productMemoryForOrder(order) {
  if (!order) return null;
  const key = productKey(order.customer, order.name);
  if (!key.replace('::', '')) return null;
  PRODUCT_MEMORY[key] = PRODUCT_MEMORY[key] || {
    customer: order.customer || '',
    name: order.name || '',
    stationPrograms: {},
    photoDataUrl: '',
    updatedAt: '',
  };
  return PRODUCT_MEMORY[key];
}

function applyProductMemoryToOrder(order) {
  const memory = productMemoryForOrder(order);
  if (!order || !memory || order.productionType !== 'repeat') return;
  order.stationPrograms = { ...(memory.stationPrograms || {}), ...(order.stationPrograms || {}) };
  if (!order.productPhotoDataUrl && memory.photoDataUrl) order.productPhotoDataUrl = memory.photoDataUrl;
}

function updateProductMemory(order) {
  const memory = productMemoryForOrder(order);
  if (!order || !memory) return;
  memory.customer = order.customer || memory.customer || '';
  memory.name = order.name || memory.name || '';
  memory.stationPrograms = { ...(memory.stationPrograms || {}), ...(order.stationPrograms || {}) };
  if (order.productPhotoDataUrl) memory.photoDataUrl = order.productPhotoDataUrl;
  memory.updatedAt = new Date().toISOString();
}

function normalizeAppData() {
  ORDERS.forEach(order => {
    order.purchaseOrderNumber ??= '';
    order.stencilNumber = normalizeLegacyStencilNumber(order.stencilNumber || '');
    order.stationPrograms = order.stationPrograms || {};
    order.productPhotoDataUrl ??= '';
    order.documents = Array.isArray(order.documents) ? order.documents : [];
    if (order.blocked && typeof order.blocked === 'object') {
      order.blocked.active = !!order.blocked.active;
      order.blocked.reason = String(order.blocked.reason || '');
    }
    order.stations = Array.isArray(order.stations) ? order.stations : [];
    order.stations.forEach(st => {
      st.stId = Number(st.stId);
      st.status ||= 'waiting';
      st.qtyOk = positiveQty(st.qtyOk);
      st.qtyRework = positiveQty(st.qtyRework);
      st.qtyScrap = positiveQty(st.qtyScrap);
      st.qtyReceived = positiveQty(st.qtyReceived);
    });
    syncOrderStationFlow(order);
    applyProductMemoryToOrder(order);
  });
}

const PROD_TYPES = {
  new:      { label:'Nová výroba',   icon:'🆕', color:'#22c55e' },
  repeat:   { label:'Opakovaná',     icon:'🔁', color:'#3b82f6' },
  revision: { label:'Revize výrobku',icon:'📝', color:'#f59e0b' },
};

let pendingDocs = [];   // dočasné dokumenty pro nový formulář
const DEFAULT_STATIONS = [1,2,3,4,5,6,7,8,9];
let pickedStations = DEFAULT_STATIONS.slice();

function newOrderModal() {
  if (!can('create_order')) {
    showToast('🚫 Nemáte oprávnění vytvořit zakázku.');
    return;
  }
  pendingDocs = [];
  pickedStations = DEFAULT_STATIONS.slice();
  const today = new Date().toISOString().slice(0,10);

  openModal('Nová zakázka', `
    <div style="background:var(--card2);border:1px solid var(--gold);border-radius:10px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <div>
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Číslo zakázky</div>
        <div style="font-size:20px;font-weight:800;color:var(--gold);font-family:'SF Mono',Menlo,monospace;letter-spacing:1.5px">${NEXT_ORDER_CODE}</div>
      </div>
      <div style="margin-left:auto;text-align:right">
        <div style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Datum objednání</div>
        <div style="font-size:13px;color:var(--text);font-weight:600">${formatDate(today)} (dnes)</div>
      </div>
    </div>

    <datalist id="dl-customers">${knownCustomers().map(c=>`<option value="${escapeHtml(c)}">`).join('')}</datalist>
    <datalist id="dl-products">${knownProducts().map(p=>`<option value="${escapeHtml(p)}">`).join('')}</datalist>

    <div class="input-group">
      <div class="input-label">Zákazník</div>
      <input class="input" id="nm-customer" list="dl-customers" placeholder="začněte psát…"
        oninput="refreshProductDatalist(this.value)">
    </div>

    <div class="input-group">
      <div class="input-label">Číslo objednávky</div>
      <input class="input" id="nm-po" placeholder="volitelné, např. OBJ-2026-001">
    </div>

    <div class="input-group">
      <div class="input-label">Název výrobku</div>
      <input class="input" id="nm-name" list="dl-products" placeholder="např. Řídicí deska RD-100">
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div class="input-group">
        <div class="input-label">Počet kusů</div>
        <input class="input" id="nm-qty" type="number" min="1" placeholder="100">
      </div>
      <div class="input-group">
        <div class="input-label">Termín dodání</div>
        <input class="input" id="nm-due" type="date">
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">Priorita</div>
      <select class="input" id="nm-priority">
        <option value="low">Nízká</option>
        <option value="normal" selected>Normální</option>
        <option value="high">Vysoká</option>
        <option value="urgent">Urgentní</option>
      </select>
    </div>

    <div class="input-group">
      <div class="input-label">Technologie pájení</div>
      <div style="display:flex;gap:8px" id="nm-tech-row">
        <button type="button" class="action-btn" data-tech="bezolovo" onclick="pickTech('bezolovo')"
          style="flex:1;justify-content:center;border-color:var(--gold);color:var(--gold);background:rgba(212,160,23,.12)">⚡ BEZOLOVO</button>
        <button type="button" class="action-btn" data-tech="olovo" onclick="pickTech('olovo')"
          style="flex:1;justify-content:center">🔧 OLOVO</button>
      </div>
      <input type="hidden" id="nm-tech" value="bezolovo">
    </div>

    <div class="input-group">
      <div class="input-label">Typ výroby</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap" id="nm-pt-row">
        ${Object.entries(PROD_TYPES).map(([k,v],i) => `
          <button type="button" class="action-btn" data-pt="${k}" onclick="pickProdType('${k}')"
            style="flex:1;min-width:90px;justify-content:center;
              ${i===0?`border-color:${v.color};color:${v.color};background:${v.color}22`:''}">${v.icon} ${v.label}</button>
        `).join('')}
      </div>
      <input type="hidden" id="nm-pt" value="new">
    </div>

    <div class="input-group">
      <div class="input-label">Číslo planžety (stencil)</div>
      <input class="input" id="nm-stencil" placeholder="např. 3/0001" inputmode="numeric" pattern="\\d+/\\d{4}">
      <div style="font-size:10px;color:var(--text3);margin-top:5px">
        Formát: číslo lomítko čtyři číslice, např. 3/0001.
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">🏭 Stanoviště výroby (${pickedStations.length}/${STATIONS.length})</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:6px">
        Vyberte, kterými stanovišti zakázka projde. Defaultně všechna.
      </div>
      <div id="nm-stations" style="display:flex;flex-wrap:wrap;gap:6px">
        ${STATIONS.map(st => {
          const on = pickedStations.includes(st.id);
          return `<button type="button" class="action-btn" data-st="${st.id}"
            onclick="toggleStation(${st.id})"
            style="font-size:11px;padding:6px 10px;${on?'border-color:var(--gold);color:var(--gold);background:rgba(212,160,23,.12)':''}">
            ${st.icon} ${st.name}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="input-group">
      <div class="input-label">📎 Dokumenty k výrobku</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px">
        ${[
          ['bom',     '📊 BOM'],
          ['drawing', '📐 Osazovací výkres'],
          ['paste',   '🎯 GBR data pasty'],
          ['other',   '📄 Ostatní'],
        ].map(([k,l]) => `
          <label class="action-btn" style="cursor:pointer;font-size:11px;justify-content:center">
            ${l}
            <input type="file" style="display:none"
              accept=".pdf,.xlsx,.xls,.csv,.zip,.gbr,.gbx,.txt,.docx,.dwg,image/*"
              onchange="handleDocPick('${k}', this.files[0])">
          </label>`).join('')}
      </div>
      <div id="nm-doc-list" style="font-size:11px;color:var(--text2)">
        Zatím žádné dokumenty nepřipojeny.
      </div>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Vytvořit zakázku', action:'createOrder()', cls:'btn-primary' },
  ]);

  // Předvyplnit termín na +14 dní
  const due = new Date(); due.setDate(due.getDate()+14);
  document.getElementById('nm-due').value = due.toISOString().slice(0,10);
}

function toggleStation(stId) {
  if (pickedStations.includes(stId)) {
    pickedStations = pickedStations.filter(x => x !== stId);
  } else {
    pickedStations = [...pickedStations, stId].sort((a,b) => a-b);
  }
  // Re-render station picker block in place
  const wrap = document.getElementById('nm-stations');
  if (wrap) {
    wrap.innerHTML = STATIONS.map(st => {
      const on = pickedStations.includes(st.id);
      return `<button type="button" class="action-btn" data-st="${st.id}"
        onclick="toggleStation(${st.id})"
        style="font-size:11px;padding:6px 10px;${on?'border-color:var(--gold);color:var(--gold);background:rgba(212,160,23,.12)':''}">
        ${st.icon} ${st.name}
      </button>`;
    }).join('');
    const lbl = wrap.previousElementSibling?.previousElementSibling;
    if (lbl) lbl.textContent = `🏭 Stanoviště výroby (${pickedStations.length}/${STATIONS.length})`;
  }
}

function pickTech(tech) {
  document.getElementById('nm-tech').value = tech;
  document.querySelectorAll('#nm-tech-row [data-tech]').forEach(btn => {
    const active = btn.dataset.tech === tech;
    if (active) {
      btn.style.borderColor = 'var(--gold)';
      btn.style.color = 'var(--gold)';
      btn.style.background = 'rgba(212,160,23,.12)';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.background = '';
    }
  });
}

function pickProdType(pt) {
  document.getElementById('nm-pt').value = pt;
  document.querySelectorAll('#nm-pt-row [data-pt]').forEach(btn => {
    const k = btn.dataset.pt;
    if (k === pt) {
      const c = PROD_TYPES[k].color;
      btn.style.borderColor = c;
      btn.style.color = c;
      btn.style.background = c + '22';
    } else {
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.background = '';
    }
  });
}

function handleDocPick(kind, file) {
  if (!file) return;
  pendingDocs.push({ name:file.name, type:kind, size:file.size });
  renderPendingDocs();
}

function renderPendingDocs() {
  const el = document.getElementById('nm-doc-list');
  if (!el) return;
  if (pendingDocs.length === 0) {
    el.innerHTML = '<span style="color:var(--text3)">Zatím žádné dokumenty nepřipojeny.</span>';
    return;
  }
  el.innerHTML = pendingDocs.map((d,i) => `
    <div style="display:flex;align-items:center;gap:8px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:6px 10px;margin-bottom:4px">
      <span style="font-size:14px">${docIcon(d.type)}</span>
      <span style="flex:1;font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.name)}</span>
      <span style="font-size:10px;color:var(--text3)">${(d.size/1024).toFixed(0)} kB</span>
      <button class="btn btn-ghost btn-sm" style="padding:2px 8px" onclick="pendingDocs.splice(${i},1);renderPendingDocs()">✕</button>
    </div>`).join('');
}

function docIcon(t) {
  return { bom:'📊', drawing:'📐', paste:'🎯', other:'📄' }[t] || '📎';
}
function docTypeLabel(t) {
  return { bom:'BOM', drawing:'Osaz. výkres', paste:'GBR pasta', other:'Dokument' }[t] || t;
}

function createOrder() {
  const name = document.getElementById('nm-name').value.trim();
  const customer = document.getElementById('nm-customer').value.trim();
  const stencil = document.getElementById('nm-stencil').value.trim();
  if (!customer) { showToast('⚠️ Vyplňte zákazníka'); return; }
  if (!name)     { showToast('⚠️ Vyplňte název výrobku'); return; }
  if (!validStencilNumber(stencil)) { showToast('⚠️ Číslo planžety musí být ve formátu 3/0001'); return; }
  const num = String(NEXT_ORDER_CODE++);
  const order = {
    id: 'o' + Date.now(),
    number: num,
    name,
    customer,
    purchaseOrderNumber: document.getElementById('nm-po').value.trim(),
    priority: document.getElementById('nm-priority').value,
    qty: parseInt(document.getElementById('nm-qty').value) || 1,
    due: document.getElementById('nm-due').value || '',
    orderDate: new Date().toISOString().slice(0,10),
    technology: document.getElementById('nm-tech').value,
    productionType: document.getElementById('nm-pt').value,
    stencilNumber: stencil,
    stationPrograms: {},
    productPhotoDataUrl: '',
    documents: [...pendingDocs],
    stations: pickedStations.map(stId => ({
      stId, status:'waiting', qtyOk:0, qtyRework:0, qtyScrap:0, qtyReceived:0,
    })),
  };
  applyProductMemoryToOrder(order);
  ORDERS.push(order);
  pendingDocs = [];
  pickedStations = DEFAULT_STATIONS.slice();
  closeModal();
  showToast('✅ Zakázka č. ' + num + ' vytvořena');
  renderOrders();
}

function editOrderModal(orderId) {
  editOrderInfoModal(orderId);
  return;
  const o = ORDERS.find(x=>x.id===orderId);
  if (!o) return;
  openModal('Upravit zakázku', `
    <div class="input-group">
      <div class="input-label">Název</div>
      <input class="input" id="eo-name" value="${o.name}">
    </div>
    <div class="input-group">
      <div class="input-label">Zákazník</div>
      <input class="input" id="eo-customer" value="${o.customer}">
    </div>
    <div class="input-group">
      <div class="input-label">Priorita</div>
      <select class="input" id="eo-priority">
        ${['low','normal','high','urgent'].map(p=>`<option value="${p}" ${o.priority===p?'selected':''}>${priorityLabel(p)}</option>`).join('')}
      </select>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Uložit', action:`saveEditOrder('${orderId}')`, cls:'btn-primary' },
  ]);
}

function saveEditOrder(id) {
  const o = ORDERS.find(x=>x.id===id);
  if (!o) return;
  o.name = document.getElementById('eo-name').value;
  o.customer = document.getElementById('eo-customer').value;
  o.priority = document.getElementById('eo-priority').value;
  closeModal(); showToast('✅ Zakázka uložena'); renderAdmin();
}

function newUserModal() {
  openModal('Nový uživatel', `
    <div class="input-group">
      <div class="input-label">Celé jméno</div>
      <input class="input" id="nu-name" placeholder="Jan Novák">
    </div>
    <div class="input-group">
      <div class="input-label">Login (uživatelské jméno)</div>
      <input class="input" id="nu-login" placeholder="jnovak">
    </div>
    <div class="input-group">
      <div class="input-label">Dočasné heslo</div>
      <input class="input" id="nu-pass" type="password" value="${DEFAULT_DEMO_PASSWORD}" autocomplete="new-password">
      <div style="font-size:11px;color:var(--text2);margin-top:5px">Heslo se ukládá pouze lokálně v tomto zařízení, ne do cloudu.</div>
    </div>
    <div class="input-group">
      <div class="input-label">Role</div>
      <select class="input" id="nu-role">
        ${Object.entries(ROLE_LABELS).map(([r,l])=>`<option value="${r}">${l}</option>`).join('')}
      </select>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Vytvořit', action:'createUser()', cls:'btn-primary' },
  ]);
}

function createUser() {
  const name = document.getElementById('nu-name').value.trim();
  const login = normalizeLogin(document.getElementById('nu-login').value);
  if (!name || !login) { showToast('⚠️ Vyplňte jméno a login'); return; }
  if (USERS.find(u=>normalizeLogin(u.login)===login)) { showToast('⚠️ Login již existuje'); return; }
  const role = document.getElementById('nu-role').value;
  const colors = { admin:'#ef4444', dispatcher:'#3b82f6', tpv:'#a855f7', management:'#22c55e', operator:'#6b7280' };
  const password = document.getElementById('nu-pass').value || DEFAULT_DEMO_PASSWORD;
  USERS.push({
    id: 'u' + Date.now(), login,
    role, name, avatar: '👤', color: colors[role]
  });
  setUserPassword(login, password);
  autoSave();
  closeModal(); showToast('✅ Uživatel ' + login + ' vytvořen'); renderAdmin();
}

function editUserModal(uid) {
  const u = USERS.find(x=>x.id===uid);
  if (!u) return;
  openModal('Upravit uživatele: ' + u.name, `
    <div class="input-group">
      <div class="input-label">Jméno</div>
      <input class="input" id="eu-name" value="${escapeHtml(u.name)}">
    </div>
    <div class="input-group">
      <div class="input-label">Login</div>
      <input class="input" id="eu-login" value="${escapeHtml(u.login)}">
    </div>
    <div class="input-group">
      <div class="input-label">Nové heslo</div>
      <input class="input" id="eu-pass" type="password" placeholder="nechte prázdné pro zachování" autocomplete="new-password">
      <div style="font-size:11px;color:var(--text2);margin-top:5px">Heslo se nezobrazuje zpět a zůstává jen v lokálním úložišti zařízení.</div>
    </div>
    <div class="input-group">
      <div class="input-label">Role</div>
      <select class="input" id="eu-role">
        ${Object.entries(ROLE_LABELS).map(([r,l])=>`<option value="${r}" ${u.role===r?'selected':''}>${l}</option>`).join('')}
      </select>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Uložit', action:`saveEditUser('${uid}')`, cls:'btn-primary' },
  ]);
}

function saveEditUser(uid) {
  const u = USERS.find(x=>x.id===uid);
  if (!u) return;
  const oldLogin = normalizeLogin(u.login);
  const newLogin = normalizeLogin(document.getElementById('eu-login').value);
  if (!newLogin) { showToast('⚠️ Login nesmí být prázdný'); return; }
  if (USERS.some(x => x.id !== uid && normalizeLogin(x.login) === newLogin)) {
    showToast('⚠️ Login již existuje');
    return;
  }
  u.name  = document.getElementById('eu-name').value;
  u.login = newLogin;
  const newPassword = document.getElementById('eu-pass').value;
  if (newLogin && oldLogin !== newLogin && USER_PASSWORDS[oldLogin] && !USER_PASSWORDS[newLogin]) {
    USER_PASSWORDS[newLogin] = USER_PASSWORDS[oldLogin];
    delete USER_PASSWORDS[oldLogin];
    saveUserPasswords();
  }
  if (newPassword) setUserPassword(newLogin, newPassword);
  u.role  = document.getElementById('eu-role').value;
  autoSave();
  closeModal(); showToast('✅ Uživatel uložen'); renderAdmin();
}

function deleteUserModal(uid) {
  const u = USERS.find(x=>x.id===uid);
  if (!u) return;
  if (currentUser?.id === uid) {
    showToast('⚠️ Nelze smazat právě přihlášeného uživatele');
    return;
  }
  if (u.role === 'admin' && USERS.filter(x => x.role === 'admin').length <= 1) {
    showToast('⚠️ Nelze smazat posledního admina');
    return;
  }

  openModal('Smazat uživatele', `
    <div style="background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:10px;padding:12px;margin-bottom:14px">
      <div style="font-size:15px;font-weight:800;color:var(--red);margin-bottom:6px">Tato akce odebere přístup</div>
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Smazat uživatele <b style="color:var(--text)">${escapeHtml(u.name)}</b>
        s loginem <b style="color:var(--text)">${escapeHtml(u.login)}</b>?
      </div>
    </div>
    <div class="card" style="background:var(--card2);box-shadow:none">
      <div style="font-size:12px;color:var(--text2);line-height:1.5">
        Lokální heslo bude odstraněno. Historické login záznamy a audit zůstanou zachované.
      </div>
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'🗑️ Smazat uživatele', action:`deleteUser('${uid}')`, cls:'btn-danger' },
  ]);
}

function deleteUser(uid) {
  const u = USERS.find(x=>x.id===uid);
  if (!u) return;
  if (currentUser?.id === uid) {
    showToast('⚠️ Nelze smazat právě přihlášeného uživatele');
    return;
  }
  if (u.role === 'admin' && USERS.filter(x => x.role === 'admin').length <= 1) {
    showToast('⚠️ Nelze smazat posledního admina');
    return;
  }

  const login = normalizeLogin(u.login);
  USERS = USERS.filter(x => x.id !== uid);
  if (login && USER_PASSWORDS[login]) {
    delete USER_PASSWORDS[login];
    saveUserPasswords();
  }
  ISSUES.forEach(issue => {
    issue.targetUserIds = (issue.targetUserIds || []).filter(id => id !== uid);
    issue.targetLogins = (issue.targetLogins || []).filter(item => normalizeLogin(item) !== login);
  });
  writeAudit(
    'user.deleted',
    'user',
    uid,
    `${u.login} · uživatel smazán`,
    { id: u.id, login: u.login, role: u.role, name: u.name },
    null,
  );
  autoSave();
  closeModal();
  renderAdmin();
  showToast('🗑️ Uživatel smazán');
}

function editStationModal(stId) {
  const st = STATIONS.find(x=>x.id===stId);
  if (!st) return;
  openModal('Upravit stanoviště', `
    <div class="input-group">
      <div class="input-label">Název</div>
      <input class="input" id="est-name" value="${st.name}">
    </div>
    <div class="input-group">
      <div class="input-label">Ikona (emoji)</div>
      <input class="input" id="est-icon" value="${st.icon}">
    </div>
  `, [
    { label:'Zrušit', action:'closeModal()', cls:'btn-ghost' },
    { label:'Uložit', action:`saveStation(${stId})`, cls:'btn-primary' },
  ]);
}

function saveStation(stId) {
  const st = STATIONS.find(x=>x.id===stId);
  if (!st) return;
  st.name = document.getElementById('est-name').value;
  st.icon = document.getElementById('est-icon').value;
  closeModal(); showToast('✅ Stanoviště uloženo'); renderAdmin();
}

// ── UTILS ─────────────────────────────────────────────
function priorityLabel(p) {
  return { low:'Nízká', normal:'Normální', high:'Vysoká', urgent:'Urgentní' }[p] || p;
}

function formatDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('cs-CZ', { day:'numeric', month:'short' }); }
  catch { return d; }
}

let toastTimer;
function showToast(msg, options = {}) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  // Bezne akce ukladaji stav, ale systemove sync hlasky nesmi spoustet dalsi cloud zapis.
  if (!options.skipSave) autoSave();
}

// ── CLOSE ON BG CLICK ─────────────────────────────────
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('numpad-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeNumpad();
});
