export const shellHtml = `<!-- ════════════════════════════════
     LANDING
════════════════════════════════ -->
<div id="landing-screen">
  <header class="landing-header">
    <button class="landing-brand" type="button" onclick="showLandingScreen()" aria-label="EZOP4 úvod">
      <span>EZOP<span>4</span></span>
    </button>
    <nav class="landing-nav" aria-label="Produkt">
      <a href="#why-ezop">Proč EZOP4</a>
      <a href="#features">Funkce</a>
      <a href="#landing-roles">Role</a>
      <a href="#landing-integrations">Integrace</a>
      <a href="#security">Bezpečnost</a>
      <a href="#pricing">Ceník</a>
      <a href="#contact">Kontakt</a>
    </nav>
    <div class="landing-header-actions">
      <button class="landing-login-link" type="button" onclick="showLoginScreen()">Přihlásit se</button>
      <button class="landing-header-demo" type="button" onclick="openDemoLogin()">Otevřít demo</button>
    </div>
  </header>

  <main class="landing-main">
    <section class="landing-hero" id="why-ezop">
      <div class="landing-hero-copy">
        <div class="landing-title-mark">EZOP<span>4</span></div>
        <h1>Výrobní řízení pro elektroniku</h1>
        <p>
          Mobilní PWA pro EMS a elektronickou výrobu. Fronty pracovišť, zakázky,
          počty kusů, problémy, blokace a audit v reálném čase. V dílně i v kanceláři.
        </p>
        <div class="landing-actions">
          <button class="landing-primary" type="button" onclick="openDemoLogin()">
            <span class="landing-btn-icon" aria-hidden="true">▣</span>
            Otevřít demo
          </button>
          <button class="landing-secondary" type="button" onclick="showLoginScreen()">
            <span class="landing-btn-icon" aria-hidden="true">▢</span>
            Přihlásit se
          </button>
        </div>
        <div class="landing-proof" aria-label="Hlavní přínosy">
          <span><b>◷</b> Reálný čas<em>Okamžitá data</em></span>
          <span><b>▦</b> PWA<em>Funguje offline</em></span>
          <span><b>⬡</b> Audit<em>Kompletní stopa</em></span>
          <span><b>☁</b> Cloud<em>Supabase</em></span>
        </div>
      </div>

      <div class="landing-product" aria-label="Náhled aplikace EZOP4">
        <div class="landing-product-top">
          <span class="landing-product-logo">EZOP<span>4</span></span>
          <nav aria-label="Náhled aplikace">
            <span class="active">Přehled</span>
            <span>Fronty</span>
            <span>Zakázky</span>
            <span>Stanoviště</span>
            <span>Problémy</span>
          </nav>
          <span class="landing-product-user">Mistr⌄</span>
        </div>
        <div class="landing-product-body">
          <div class="landing-panel landing-fronts">
            <h3>Fronty pracovišť</h3>
            <div class="landing-front-row"><span>Sklad</span><b>2 / 5</b><em>1 blokováno</em></div>
            <div class="landing-front-row"><span>Automat 1</span><b>3 / 4</b></div>
            <div class="landing-front-row ok"><span>AOI</span><b>4 / 4</b><em>Plná kapacita</em></div>
            <div class="landing-front-row"><span>RTG</span><b>1 / 3</b></div>
            <div class="landing-front-row"><span>THT montáž</span><b>2 / 3</b><em>1 blokováno</em></div>
            <div class="landing-front-row"><span>Kontrola</span><b>2 / 3</b></div>
            <div class="landing-front-row"><span>Balení</span><b>1 / 2</b></div>
            <button class="landing-mini-btn" type="button">Zobrazit detail front</button>
          </div>
          <div class="landing-panel landing-overview">
            <h3>Dnešní přehled</h3>
            <div class="landing-kpi-grid">
              <div><span>Zakázky</span><b>18</b><em>Aktivní</em></div>
              <div><span>OK</span><b class="green">1 246</b></div>
              <div><span>Oprava</span><b class="amber">132</b></div>
              <div><span>Zmetek</span><b class="red">27</b></div>
              <div><span>Včasnost</span><b>92 %</b><em class="green">▲ 6 %</em></div>
              <div><span>Výkon</span><b>83 %</b><em class="green">▲ 4 %</em></div>
              <div><span>Problémy</span><b class="red">3</b><em>Aktivní</em></div>
              <div><span>Blokované</span><b class="red">2</b><em>Zakázky</em></div>
            </div>
            <div class="landing-current-work">
              <h3>Aktuální práce</h3>
              <div class="landing-work-card">
                <div>
                  <b>Z-2025-0187</b>
                  <span>Deska řídicí jednotky V2</span>
                  <small>Stanoviště AOI · Operátor Jan Novák · Plán 1 000 ks</small>
                </div>
                <div class="landing-ring"><span>75 %</span></div>
                <ul>
                  <li><span>OK</span><b class="green">720</b></li>
                  <li><span>Oprava</span><b class="amber">20</b></li>
                  <li><span>Zmetek</span><b class="red">10</b></li>
                </ul>
              </div>
            </div>
            <div class="landing-issues">
              <h3>Poslední problémy <span>Zobrazit vše</span></h3>
              <p>AOI - falešné chyby na konektoru J3 <time>10:21</time></p>
              <p>RTG - čeká se na výměnu zdroje <time>09:47</time></p>
              <p>THT - chybí materiál R47 10k <time>09:15</time></p>
            </div>
          </div>
        </div>
        <div class="landing-product-status">
          <span>● Online</span>
          <span>Poslední aktualizace: 10:23:45</span>
          <span>Verze 4.0.0</span>
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
