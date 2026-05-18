/**
 * Patches: nadbudovává legacy runtime funkce o nové schopnosti
 * bez modifikace samotného runtime.js.
 *
 * Co patchneme:
 *  - reportIssueModal + submitIssue → přidání fotky k problému
 *  - openIssueDetail → zobrazení fotky v detailu
 *  - renderOrders → rychlé filtry (chipy) nad seznamem
 *  - openOrder → tlačítko „🖨 Tisk zakázky" v detailu
 */

const W = window as any;

const PHOTO_INPUT_ID = 'ux-issue-photo-input';
const PHOTO_PREVIEW_ID = 'ux-issue-photo-preview';
const PHOTO_DATA_ID = 'ux-issue-photo-data';
const MAX_PHOTO_WIDTH = 1024;
const JPEG_QUALITY = 0.78;

/* ════════════════════════════════
   PHOTO CAPTURE
════════════════════════════════ */

function resizeImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, MAX_PHOTO_WIDTH / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas not supported')); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = String(e.target?.result || '');
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

function photoCaptureHtml(): string {
  return `
    <div class="ux-photo-section" style="margin-top:14px">
      <div class="input-label" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:6px">
        📷 Foto k problému (nepovinné)
      </div>
      <input type="hidden" id="${PHOTO_DATA_ID}">
      <input type="file" accept="image/*" capture="environment" id="${PHOTO_INPUT_ID}" style="display:none">
      <div id="${PHOTO_PREVIEW_ID}" class="ux-photo-pad">
        <button type="button" class="ux-photo-trigger" onclick="document.getElementById('${PHOTO_INPUT_ID}').click()">
          <span class="ux-photo-icon">📷</span>
          <span>Vyfotit nebo vybrat fotku</span>
        </button>
      </div>
    </div>
  `;
}

function bindPhotoInput() {
  const input = document.getElementById(PHOTO_INPUT_ID) as HTMLInputElement | null;
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const preview = document.getElementById(PHOTO_PREVIEW_ID);
    if (preview) {
      preview.innerHTML = `<div class="ux-photo-loading">Zpracovávám fotku…</div>`;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      const dataInput = document.getElementById(PHOTO_DATA_ID) as HTMLInputElement | null;
      if (dataInput) dataInput.value = dataUrl;
      if (preview) {
        preview.innerHTML = `
          <img src="${dataUrl}" alt="Foto problému" class="ux-photo-img">
          <div class="ux-photo-actions">
            <button type="button" class="ux-btn" onclick="document.getElementById('${PHOTO_INPUT_ID}').click()">📷 Vyměnit</button>
            <button type="button" class="ux-btn danger" id="ux-photo-remove">✕ Odebrat</button>
          </div>
        `;
        document.getElementById('ux-photo-remove')?.addEventListener('click', () => {
          if (dataInput) dataInput.value = '';
          input.value = '';
          preview.innerHTML = `
            <button type="button" class="ux-photo-trigger" onclick="document.getElementById('${PHOTO_INPUT_ID}').click()">
              <span class="ux-photo-icon">📷</span>
              <span>Vyfotit nebo vybrat fotku</span>
            </button>
          `;
        });
      }
    } catch (err) {
      if (preview) {
        preview.innerHTML = `<div class="ux-photo-error">Fotku se nepodařilo zpracovat: ${(err as Error).message}</div>`;
      }
    }
  });
}

function patchIssueReporting() {
  if (typeof W.reportIssueModal === 'function' && !W.__uxPatchedReportIssue) {
    const original = W.reportIssueModal;
    W.reportIssueModal = function (...args: any[]) {
      const result = original.apply(this, args);
      // Modal HTML je nyní v DOM. Doplníme foto sekci.
      setTimeout(() => {
        const body = document.getElementById('modal-body');
        if (!body || document.getElementById(PHOTO_INPUT_ID)) return;
        body.insertAdjacentHTML('beforeend', photoCaptureHtml());
        bindPhotoInput();
      }, 0);
      return result;
    };
    W.__uxPatchedReportIssue = true;
  }

  if (typeof W.submitIssue === 'function' && !W.__uxPatchedSubmitIssue) {
    const original = W.submitIssue;
    W.submitIssue = function (...args: any[]) {
      const dataInput = document.getElementById(PHOTO_DATA_ID) as HTMLInputElement | null;
      const photo = dataInput?.value || '';
      const result = original.apply(this, args);
      // Po původním kódu je nová issue na začátku ISSUES.
      if (photo) {
        try {
          const issues = W.__ezopBridge?.issues?.();
          if (issues && issues[0]) {
            issues[0].photo = photo;
            if (typeof W.saveState === 'function') W.saveState();
          }
        } catch { /* ignore */ }
      }
      return result;
    };
    W.__uxPatchedSubmitIssue = true;
  }

  if (typeof W.openIssueDetail === 'function' && !W.__uxPatchedOpenIssue) {
    const original = W.openIssueDetail;
    W.openIssueDetail = function (issueId: string, ...rest: any[]) {
      const result = original.call(this, issueId, ...rest);
      setTimeout(() => {
        try {
          const issues = W.__ezopBridge?.issues?.() || [];
          const issue = issues.find((i: any) => i.id === issueId);
          if (!issue?.photo) return;
          const body = document.getElementById('modal-body');
          if (!body || body.querySelector('.ux-issue-photo')) return;
          const wrap = document.createElement('div');
          wrap.className = 'ux-issue-photo';
          wrap.innerHTML = `
            <div class="input-label" style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin:14px 0 6px">📷 Foto</div>
            <img src="${issue.photo}" alt="Foto problému" class="ux-photo-img" style="cursor:zoom-in" id="ux-issue-photo-img">
          `;
          body.appendChild(wrap);
          document.getElementById('ux-issue-photo-img')?.addEventListener('click', () => openPhotoLightbox(issue.photo));
        } catch { /* ignore */ }
      }, 0);
      return result;
    };
    W.__uxPatchedOpenIssue = true;
  }
}

function openPhotoLightbox(src: string) {
  const overlay = document.createElement('div');
  overlay.className = 'ux-photo-lightbox';
  overlay.innerHTML = `<img src="${src}" alt="Foto"><button class="ux-photo-lightbox-close" aria-label="Zavřít">✕</button>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.ux-photo-lightbox-close')?.addEventListener('click', close);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

/* ════════════════════════════════
   QUICK FILTERS V ZAKÁZKÁCH
════════════════════════════════ */

type FilterId = 'all' | 'urgent' | 'today' | 'week' | 'blocked' | 'issue' | 'mine';

const FILTERS: { id: FilterId; label: string; icon: string }[] = [
  { id: 'all',     label: 'Vše',           icon: '◯' },
  { id: 'urgent',  label: 'Urgentní',      icon: '⚡' },
  { id: 'today',   label: 'Dnes',          icon: '📅' },
  { id: 'week',    label: 'Tento týden',   icon: '🗓' },
  { id: 'blocked', label: 'Blokované',     icon: '⛔' },
  { id: 'issue',   label: 'S problémem',   icon: '⚠️' },
  { id: 'mine',    label: 'Moje',          icon: '👤' },
];

let activeQuickFilter: FilterId = 'all';

function matchesFilter(order: any, id: FilterId, user: any): boolean {
  if (!order) return false;
  switch (id) {
    case 'all': return true;
    case 'urgent': return order.priority === 'urgent' || order.priority === 'high';
    case 'today': {
      if (!order.due) return false;
      const due = new Date(order.due);
      const today = new Date();
      return due.toDateString() === today.toDateString();
    }
    case 'week': {
      if (!order.due) return false;
      const due = new Date(order.due);
      const now = new Date();
      const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }
    case 'blocked': return !!order.blocked;
    case 'issue': return (order.stations || []).some((s: any) => s.status === 'issue');
    case 'mine': {
      if (!user) return false;
      const stationIds: number[] = (user.stationIds || []).map((x: any) => Number(x));
      const login = String(user.login || '').toLowerCase();
      return (order.stations || []).some((s: any) =>
        stationIds.includes(Number(s.stId)) ||
        (s.workerLogin && String(s.workerLogin).toLowerCase() === login)
      );
    }
  }
}

function countFilter(id: FilterId): number {
  try {
    const orders = W.__ezopBridge?.orders?.() || [];
    const user = W.__ezopBridge?.user?.() || null;
    return orders.filter((o: any) => matchesFilter(o, id, user)).length;
  } catch { return 0; }
}

function renderQuickFilters(into: HTMLElement) {
  into.innerHTML = FILTERS.map(f => {
    const count = countFilter(f.id);
    const active = activeQuickFilter === f.id ? 'active' : '';
    return `<button class="ux-chip ${active}" data-qf="${f.id}">
      <span>${f.icon}</span>${f.label}
      <em>${count}</em>
    </button>`;
  }).join('');
  into.querySelectorAll<HTMLButtonElement>('[data-qf]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeQuickFilter = btn.dataset.qf as FilterId;
      applyQuickFilter();
      into.querySelectorAll('[data-qf]').forEach(b => b.classList.toggle('active', b === btn));
    });
  });
}

function applyQuickFilter() {
  try {
    const list = document.getElementById('ord-list');
    if (!list) return;
    const orders = W.__ezopBridge?.orders?.() || [];
    const user = W.__ezopBridge?.user?.() || null;
    if (activeQuickFilter === 'all') {
      // Necháme legacy renderOrders znovu vykreslit (zachová search/filter)
      if (typeof W.renderOrders === 'function') {
        const origCall = (W as any).__uxRenderOrdersOriginal || W.renderOrders;
        origCall();
        // Po překreslení znovu vsadit filtry
        injectQuickFilters();
      }
      return;
    }
    const filtered = orders.filter((o: any) => matchesFilter(o, activeQuickFilter, user));
    const cards = filtered.map((o: any) => orderCardSimpleHtml(o)).join('');
    list.innerHTML = cards || `<div class="card" style="text-align:center;color:var(--text2);padding:30px">Nic neodpovídá tomuto filtru.</div>`;
  } catch { /* silent */ }
}

function orderCardSimpleHtml(o: any): string {
  // Použijeme legacy ordersListHtml pokud existuje — má lepší vizuál
  if (typeof W.ordersListHtml === 'function') {
    try { return W.ordersListHtml([o]); } catch { /* fall through */ }
  }
  const done = (o.stations || []).filter((s: any) => s.status === 'completed').length;
  const total = (o.stations || []).length || 1;
  const pct = Math.round(done / total * 100);
  return `<div class="card" style="padding:14px;margin-bottom:8px;cursor:pointer" onclick="openOrder('${o.id}')">
    <strong>${o.number}</strong> — ${o.name || ''}
    <div style="font-size:12px;color:var(--text2);margin-top:4px">${o.customer || ''} · ${pct}%</div>
  </div>`;
}

function injectQuickFilters() {
  const page = document.getElementById('page-orders');
  if (!page) return;
  const toolbar = page.querySelector('.app-filter-card');
  if (!toolbar) return;
  let bar = page.querySelector<HTMLDivElement>('#ux-order-filters');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ux-order-filters';
    bar.className = 'ux-quick-filters';
    toolbar.insertAdjacentElement('afterend', bar);
  }
  renderQuickFilters(bar);
}

function patchOrderList() {
  if (typeof W.renderOrders !== 'function' || W.__uxPatchedRenderOrders) return;
  const original = W.renderOrders;
  W.__uxRenderOrdersOriginal = original;
  W.renderOrders = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(injectQuickFilters, 0);
    return result;
  };
  W.__uxPatchedRenderOrders = true;
}

/* ════════════════════════════════
   TISK ZAKÁZKY
════════════════════════════════ */

function injectPrintButton() {
  const page = document.getElementById('page-orders');
  if (!page) return;
  // Detail zakázky se renderuje do page-orders (legacy přepíná detailView).
  // Hledáme typický header s číslem zakázky.
  const detailHead = page.querySelector('.app-order-detail, .app-page-hero');
  if (!detailHead) return;
  if (page.querySelector('#ux-print-order')) return;
  const btn = document.createElement('button');
  btn.id = 'ux-print-order';
  btn.className = 'btn btn-ghost btn-sm';
  btn.textContent = '🖨 Tisk';
  btn.style.marginLeft = '8px';
  btn.addEventListener('click', () => window.print());
  // Umístíme do toolbaru pokud existuje, jinak na konec headu
  const toolbar = page.querySelector('.app-list-toolbar') || detailHead;
  toolbar.appendChild(btn);
}

function injectTimelineToggle() {
  const card = document.querySelector<HTMLElement>('.order-timeline-card');
  if (!card || card.querySelector('.ux-timeline-toggle')) return;
  const list = card.querySelector<HTMLElement>('.order-timeline-list');
  if (!list) return;
  const count = list.querySelectorAll('.order-timeline-item').length;
  if (count <= 3) return; // few items — no need to collapse
  const btn = document.createElement('button');
  btn.className = 'ux-timeline-toggle';
  btn.dataset.uxTimeline = '0';
  btn.textContent = `▼  Zobrazit celou historii (${count} událostí)`;
  btn.addEventListener('click', () => {
    const expanded = btn.dataset.uxTimeline === '1';
    if (expanded) {
      list.classList.remove('ux-expanded');
      btn.dataset.uxTimeline = '0';
      btn.textContent = `▼  Zobrazit celou historii (${count} událostí)`;
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      list.classList.add('ux-expanded');
      btn.dataset.uxTimeline = '1';
      btn.textContent = `▲  Sbalit historii`;
    }
  });
  card.appendChild(btn);
}

function patchOrderDetail() {
  if (typeof W.openOrder !== 'function' || W.__uxPatchedOpenOrder) return;
  const original = W.openOrder;
  W.openOrder = function (...args: any[]) {
    const result = original.apply(this, args);
    setTimeout(() => {
      injectPrintButton();
      injectTimelineToggle();
    }, 0);
    return result;
  };
  W.__uxPatchedOpenOrder = true;
}

/* ════════════════════════════════
   PUBLIC ENTRY
════════════════════════════════ */

export function installPatches() {
  // Patches musí čekat, až legacy runtime definuje funkce.
  // Zkusíme hned a pak pravidelně do té doby, než jsou dostupné.
  let attempts = 0;
  const tick = () => {
    attempts++;
    patchIssueReporting();
    patchOrderList();
    patchOrderDetail();
    const allDone = W.__uxPatchedReportIssue && W.__uxPatchedSubmitIssue
      && W.__uxPatchedOpenIssue && W.__uxPatchedRenderOrders && W.__uxPatchedOpenOrder;
    if (allDone || attempts > 40) return;
    setTimeout(tick, 100);
  };
  tick();
}
