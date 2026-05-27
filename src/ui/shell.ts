export const shellHtml = `<!-- ════════════════════════════════
     LANDING
════════════════════════════════ -->
<div id="landing-screen">
  <div class="lp-root">
    <div class="lp-card">
      <div class="lp-logo">EZOP<span>4</span></div>
      <div class="lp-tagline">Výrobní systém pro EMS linky</div>

      <div class="lp-features">
        <div class="lp-feat"><span>⚡</span><span>Fronty práce podle role</span></div>
        <div class="lp-feat"><span>📊</span><span>KPI a zakázky v reálném čase</span></div>
        <div class="lp-feat"><span>☁</span><span>Cloud nebo on-premise · PWA</span></div>
      </div>

      <div class="lp-actions">
        <button class="lp-btn-primary" type="button" onclick="showLoginScreen()">
          Přihlásit se
        </button>
        <button class="lp-btn-secondary" type="button" onclick="openDemoLogin()">
          Spustit demo
        </button>
      </div>

      <div class="lp-roles">
        <span class="lp-role">♙ Operátor</span>
        <span class="lp-role">♟ Mistr</span>
        <span class="lp-role">▣ TPV</span>
        <span class="lp-role">▥ Vedení</span>
        <span class="lp-role">🔧 Admin</span>
      </div>
    </div>

    <div class="lp-footer">
      <span>Supabase · Lupa NET · AI</span>
      <span>Auditní stopa · Offline PWA</span>
    </div>
  </div>
</div>

<!-- ════════════════════════════════
     LOGIN
════════════════════════════════ -->
<div id="login-screen">
  <div class="login-box">
    <button class="login-back" type="button" onclick="showLandingScreen()">← Zpět na úvod</button>
    <div class="login-logo">⚡</div>
    <div class="login-title">EZOP 4</div>
    <div class="login-sub">Mobilní výrobní EZOP</div>

    <div class="login-label">Přihlašovací jméno</div>
    <input id="login-user" class="login-input" type="text" placeholder="uživatel" autocomplete="username" />

    <div class="login-label">Heslo</div>
    <input id="login-pass" class="login-input" type="password" placeholder="••••" autocomplete="current-password" />

    <label class="remember-row">
      <input id="remember-user" type="checkbox" />
      <span>Zapamatovat uživatele</span>
    </label>

    <button class="login-btn" onclick="doLogin()">Přihlásit se</button>
    <button id="passkey-login-btn" class="login-passkey-btn" type="button" onclick="loginWithPasskey()">
      🔐 Přihlásit biometrií / passkey
    </button>
    <div id="passkey-login-hint" class="login-passkey-hint"></div>
    <div id="login-error" class="login-error"></div>
  </div>
</div>
<!-- ════════════════════════════════
     APP SHELL
════════════════════════════════ -->
<div id="app">
  <!-- Topbar -->
  <div class="topbar">
    <div class="topbar-logo">EZOP<span>4</span></div>
    <span id="tbar-cloud" class="role-badge" style="font-size:10px"></span>
    <span id="tbar-name" class="topbar-user"></span>
    <span id="tbar-role" class="role-badge"></span>
    <span id="tbar-attendance" class="role-badge" style="font-size:10px;cursor:pointer;display:none" onclick="navigateTo('workspace')"></span>
    <button id="tbar-notifications" class="notification-btn" style="display:none" title="Upozornění" onclick="openNotificationsModal()">🔔<span id="notification-count"></span></button>
    <button id="tbar-messenger" class="notification-btn messenger-btn" style="display:none" title="Messenger" onclick="openMessengerModal()">💬<span id="messenger-count"></span></button>
    <button id="tbar-search" class="logout-btn" style="background:transparent;display:none" title="Hledat (Ctrl+K)" onclick="openGlobalSearch()">🔎</button>
    <button id="tbar-theme" class="logout-btn theme-toggle-btn" title="Přepnout tmavý/světlý režim" aria-label="Přepnout tmavý/světlý režim" onclick="toggleAppTheme()">🌙</button>
    <button id="tbar-install" class="logout-btn" style="background:rgba(226,184,32,.15);color:var(--gold);display:none" title="Nainstalovat aplikaci" onclick="triggerPwaInstall()">📥 Instalovat</button>
    <button class="logout-btn" onclick="doLogout()">Odhlásit</button>
  </div>

  <!-- Desktop nav -->
  <div class="navtabs" id="navtabs"></div>

  <!-- Pages -->
  <div style="padding-bottom:8px">
    <div class="page" id="page-dashboard"><!-- filled by JS --></div>
    <div class="page" id="page-orders"><!-- filled by JS --></div>
    <div class="page" id="page-kanban"><!-- filled by UX (kanban.ts) --></div>
    <div class="page" id="page-station"><!-- filled by JS --></div>
    <div class="page" id="page-issues"><!-- filled by JS --></div>
    <div class="page" id="page-kpi"><!-- filled by JS --></div>
    <div class="page" id="page-admin"><!-- filled by JS --></div>
    <div class="page" id="page-workspace"><!-- filled by JS --></div>
    <div class="page" id="page-profile"><!-- filled by JS --></div>
  </div>

  <!-- Mobile bottom nav -->
  <div class="bottom-nav" id="bottom-nav"></div>
</div>

<!-- Numpad overlay -->
<div class="numpad-overlay" id="numpad-overlay">
  <div class="numpad">
    <div class="numpad-header">
      <span class="numpad-title" id="numpad-title">Počet kusů</span>
      <button class="btn btn-ghost btn-sm" onclick="closeNumpad()">✕ Zavřít</button>
    </div>
    <div class="numpad-display" id="numpad-display">0</div>
    <div class="numpad-grid">
      <button class="numpad-btn" onclick="numInput('7')">7</button>
      <button class="numpad-btn" onclick="numInput('8')">8</button>
      <button class="numpad-btn" onclick="numInput('9')">9</button>
      <button class="numpad-btn" onclick="numInput('4')">4</button>
      <button class="numpad-btn" onclick="numInput('5')">5</button>
      <button class="numpad-btn" onclick="numInput('6')">6</button>
      <button class="numpad-btn" onclick="numInput('1')">1</button>
      <button class="numpad-btn" onclick="numInput('2')">2</button>
      <button class="numpad-btn" onclick="numInput('3')">3</button>
      <button class="numpad-btn del" onclick="numDelete()">⌫</button>
      <button class="numpad-btn" onclick="numInput('0')">0</button>
      <button class="numpad-btn ok" onclick="numConfirm()">OK</button>
    </div>
  </div>
</div>

<!-- Generic modal -->
<div class="modal-overlay" id="modal-overlay">
  <div class="modal-box" id="modal-box">
    <div class="modal-title" id="modal-title"></div>
    <div id="modal-body"></div>
    <div class="modal-actions" id="modal-actions"></div>
  </div>
</div>

<div id="toast"></div>
<div class="pcb-corner"></div>`;
