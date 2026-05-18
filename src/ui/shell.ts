export const shellHtml = `<!-- ════════════════════════════════
     LANDING
════════════════════════════════ -->
<div id="landing-screen">
  <header class="landing-header">
    <button class="landing-brand" type="button" onclick="showLandingScreen()" aria-label="EZOP4 úvod">
      <span>EZOP<span>4</span></span>
    </button>
    <nav class="landing-nav" aria-label="Produkt">
      <a href="#why-ezop">Přehled</a>
      <a href="#landing-roles">Role</a>
      <a href="#landing-integrations">Integrace</a>
      <a href="#security">Bezpečnost</a>
    </nav>
    <div class="landing-header-actions">
      <button class="landing-login-link" type="button" onclick="showLoginScreen()">Přihlásit se</button>
      <button class="landing-header-demo" type="button" onclick="openDemoLogin()">Spustit demo</button>
    </div>
  </header>

  <main class="landing-main">
    <section class="landing-hero" id="why-ezop">
      <div class="landing-hero-copy">
        <div class="landing-kicker">Mobilní EZOP pro výrobu elektroniky</div>
        <h1>Jedna obrazovka pro směnu, zakázky a stanoviště.</h1>
        <p>
          Přihlášení podle role, fronty práce, počty kusů, problémy, poznámky,
          messenger a audit. V dílně na telefonu, v kanceláři na PC.
        </p>
        <div class="landing-actions">
          <button class="landing-primary" type="button" onclick="openDemoLogin()">
            Spustit demo
          </button>
          <button class="landing-secondary" type="button" onclick="showLoginScreen()">
            Přihlásit se
          </button>
        </div>
        <div class="landing-proof" aria-label="Stav systému">
          <span><b>4</b> aktivní zakázky<em>v demo datech</em></span>
          <span><b>9</b> stanovišť<em>v trase výroby</em></span>
          <span><b>5</b> rolí<em>s oprávněními</em></span>
        </div>
      </div>

      <div class="landing-product" aria-label="Náhled aplikace EZOP4">
        <div class="landing-product-top">
          <span class="landing-product-logo">EZOP<span>4</span></span>
          <nav aria-label="Náhled aplikace">
            <span class="active">Přehled</span>
            <span>Zakázky</span>
            <span>Stanoviště</span>
            <span>Problémy</span>
          </nav>
          <span class="landing-product-user">☁ Cloud</span>
        </div>
        <div class="landing-product-body">
          <div class="landing-panel landing-shift">
            <div class="landing-panel-head">
              <span>Směna dnes</span>
              <b>online</b>
            </div>
            <div class="landing-shift-grid">
              <div><b>4</b><span>Zakázky</span></div>
              <div><b class="green">378</b><span>OK kusů</span></div>
              <div><b class="amber">12</b><span>Oprava</span></div>
              <div><b class="red">1</b><span>Problém</span></div>
            </div>
            <div class="landing-active-task">
              <div>
                <small>Právě běží</small>
                <strong>261100 · Řídicí deska VB-300</strong>
                <span>Sklad → Automat → AOI → RTG</span>
              </div>
              <em>Hotovo 22%</em>
            </div>
          </div>

          <div class="landing-panel landing-station-preview">
            <div class="landing-panel-head">
              <span>Stanoviště</span>
              <b>operátor</b>
            </div>
            <div class="landing-station-title">
              <span>📦</span>
              <div><strong>Sklad</strong><small>261100 · Řídicí deska VB-300</small></div>
            </div>
            <div class="landing-counts">
              <div><b class="green">150</b><span>OK</span></div>
              <div><b class="amber">0</b><span>Oprava</span></div>
              <div><b class="red">0</b><span>Zmetek</span></div>
            </div>
            <button class="landing-next-step" type="button">Další stanoviště · 🤖 Automat →</button>
          </div>

          <div class="landing-panel landing-alert-preview">
            <div class="landing-panel-head">
              <span>Upozornění</span>
              <b>2 nové</b>
            </div>
            <p><strong>💬 Marie Horáčková</strong><span>Dotaz k zakázce 261100</span></p>
            <p><strong>⚠ Problém</strong><span>Montáž THT · není materiál</span></p>
          </div>
        </div>
        <div class="landing-product-status">
          <span>● Online</span>
          <span>PWA · mobil i PC</span>
          <span>Supabase ready</span>
        </div>
      </div>
    </section>

    <section class="landing-section" id="landing-roles">
      <div class="landing-section-head compact">
        <h2>Každá role. Jasná práce. Rychlé výsledky.</h2>
      </div>
      <div class="landing-role-grid">
        <article>
          <span class="landing-role-icon">♙</span>
          <strong>Operátor</strong>
          <em>Práce bez zbytečných kroků</em>
          <ul>
            <li>Vidí jen svou frontu práce</li>
            <li>Převzetí, start, pauza, dokončení</li>
            <li>Zadání OK / oprava / zmetek</li>
            <li>Rychlé nahlášení problému</li>
            <li>QR / kód zakázky i produktu</li>
          </ul>
        </article>
        <article>
          <span class="landing-role-icon">♟</span>
          <strong>Mistr</strong>
          <em>Plynulost a řešení hned</em>
          <ul>
            <li>Přehled front a vytíženosti</li>
            <li>Blokace a priority zakázek</li>
            <li>Přesuny mezi stanovišti</li>
            <li>Řešení problémů s týmem</li>
            <li>Poznámky k výrobku a procesu</li>
          </ul>
        </article>
        <article>
          <span class="landing-role-icon">▣</span>
          <strong>TPV</strong>
          <em>Technologie pod kontrolou</em>
          <ul>
            <li>Nastavení postupů a pracovních tras</li>
            <li>BOM a materiály</li>
            <li>Parametry, kontroly, kritéria</li>
            <li>AI souhrn zakázky</li>
            <li>Změnové řízení s auditní stopou</li>
          </ul>
        </article>
        <article>
          <span class="landing-role-icon">▥</span>
          <strong>Vedení</strong>
          <em>Data pro rozhodování</em>
          <ul>
            <li>KPI v reálném čase</li>
            <li>Výkon, včasnost, kvalita</li>
            <li>Trend problémů a zmetkovitosti</li>
            <li>Vytížení linek a lidí</li>
            <li>Exporty do Lupa NET</li>
          </ul>
        </article>
      </div>
    </section>

    <section class="landing-flow-section" id="landing-flow">
      <div class="landing-section-head compact">
        <h2>Výrobní tok pod kontrolou</h2>
      </div>
      <div class="landing-flow">
        <span><b>1</b><strong>▱</strong><em>Sklad</em><small>Příjem, výdej, materiál k zakázkám</small></span>
        <span><b>2</b><strong>▣</strong><em>Automat</em><small>SMT výroba, osazení desek</small></span>
        <span><b>3</b><strong>◉</strong><em>AOI</em><small>Optická kontrola, OK / NG</small></span>
        <span><b>4</b><strong>☢</strong><em>RTG</em><small>RTG kontrola kritických spojů</small></span>
        <span><b>5</b><strong>⌁</strong><em>Montáž</em><small>THT / ruční montáž, sestavy</small></span>
        <span><b>6</b><strong>☑</strong><em>Kontrola</em><small>Funkční test, vizuální kontrola</small></span>
        <span><b>7</b><strong>▱</strong><em>Balení</em><small>Balení, štítky, expedice</small></span>
      </div>
      <p class="landing-flow-note">Každý krok, každá informace, jedna zakázka.</p>
    </section>

    <section class="landing-section landing-split" id="landing-integrations">
      <div class="landing-integration-block" id="features">
        <h2>Integrace, které dávají smysl</h2>
        <div class="landing-integration-list">
          <div><b>Supabase</b><span>Cloudová databáze, autentizace, Row Level Security a audit.</span></div>
          <div><b>Lupa NET</b><span>Export do Lupa NET a připravené API.</span></div>
          <div><b>Tabulková data</b><span>Práce s vašimi daty jako v tabulce. Importy, exporty, šablony.</span></div>
          <div><b>AI asistent</b><span>Souhrn zakázky, nápověda k problémům, doporučení.</span></div>
        </div>
      </div>
      <div class="landing-security-block" id="security">
        <h2>Bezpečné. Spolehlivé. Připravené na provoz.</h2>
        <ul class="landing-check-list">
          <li>Role a oprávnění dle firemní struktury</li>
          <li>Kompletní auditní stopa (kdo, co, kdy)</li>
          <li>PWA - offline režim, rychlé načítání</li>
          <li>Zálohy a obnova dat</li>
          <li>Provoz v cloudu nebo on-premise</li>
        </ul>
      </div>
    </section>

    <section class="landing-bottom-cta" id="pricing">
      <div>
        <h2>Začněte pilotem na jedné lince</h2>
        <p>Rychlá implementace. Viditelné výsledky. Ceník se řeší podle rozsahu pilotu, počtu rolí a integrací.</p>
      </div>
      <div class="landing-bottom-actions" id="contact">
        <button class="landing-primary" type="button" onclick="openDemoLogin()">Otevřít demo</button>
        <a class="landing-secondary" href="#contact">Kontaktujte nás</a>
      </div>
    </section>
  </main>
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
