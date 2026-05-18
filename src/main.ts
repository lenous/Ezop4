import './styles/theme.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/mobile.css';
import './styles/ux.css';

import { shellHtml } from './ui/shell';
import { defaults } from './domain/defaultData';
import * as productionFlow from './domain/productionFlow';
import * as ezop4Audit from './services/auditLog';
import { appStateToEzop4Tables } from './services/appStateMigration';
import * as ezop4Auth from './auth/supabaseAuth';
import * as lupaNetIntegration from './services/lupaNetIntegration';
import * as ezop4Ai from './services/aiAssistant';
import { initUx } from './features/ux';
import legacyRuntimeSource from './legacy/runtime.js?raw';

declare global {
  interface Window {
    __EZOP4_VERSION__?: string;
    EZOP_DEFAULTS?: typeof defaults;
    EZOP_FLOW?: typeof productionFlow;
    EZOP4_TO_TABLES?: typeof appStateToEzop4Tables;
    EZOP4_AUTH?: typeof ezop4Auth;
    EZOP4_AUDIT?: typeof ezop4Audit;
    EZOP4_LUPA_NET?: typeof lupaNetIntegration;
    EZOP4_AI?: typeof ezop4Ai;
  }
}

window.__EZOP4_VERSION__ = '0.1.0';
window.EZOP_DEFAULTS = defaults;
window.EZOP_FLOW = productionFlow;
window.EZOP4_TO_TABLES = appStateToEzop4Tables;
window.EZOP4_AUTH = ezop4Auth;
window.EZOP4_AUDIT = ezop4Audit;
window.EZOP4_LUPA_NET = lupaNetIntegration;
window.EZOP4_AI = ezop4Ai;

const root = document.querySelector<HTMLDivElement>('#root');
if (!root) throw new Error('Missing #root element');

root.innerHTML = shellHtml;

const runtimeScript = document.createElement('script');
runtimeScript.dataset.ezopRuntime = 'legacy-compatible';
runtimeScript.textContent = legacyRuntimeSource;
document.body.appendChild(runtimeScript);

// Bridge: zpřístupní runtime let/const proměnné (které nejsou na window) přes funkce.
// Musí to být classic <script> ve stejném globálním lexikálním scope jako runtime.
const bridgeScript = document.createElement('script');
bridgeScript.dataset.ezopRuntime = 'ux-bridge';
bridgeScript.textContent = `
  window.__ezopBridge = {
    user: function() { return typeof currentUser !== 'undefined' ? currentUser : null; },
    page: function() { return typeof currentPage !== 'undefined' ? currentPage : ''; },
    stations: function() { return typeof STATIONS !== 'undefined' ? STATIONS : []; },
    orders: function() { return typeof ORDERS !== 'undefined' ? ORDERS : []; },
    issues: function() { return typeof ISSUES !== 'undefined' ? ISSUES : []; },
    users: function() { return typeof USERS !== 'undefined' ? USERS : []; }
  };
`;
document.body.appendChild(bridgeScript);

initUx();
