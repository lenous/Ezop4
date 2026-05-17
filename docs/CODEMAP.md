# EZOP 4 Code Map

Use this map before opening large files. It keeps future changes focused and cheaper.

## Most Common Changes

- Production count rules: `src/domain/productionFlow.ts`
- Demo users, orders, stations and seed notes: `src/domain/defaultData.ts`
- Order station sequence UI: `src/legacy/runtime.js`, search `manageStationsModal`
- Memory cleanup rules: `src/legacy/runtime.js`, search `cleanupAppMemory`
- Session lock rules: `src/legacy/runtime.js`, search `sessionLockTimeoutMs`
- Feature visibility flags: `src/legacy/runtime.js`, search `featureEnabled`; defaults in `src/domain/defaultData.ts`
- Role permission overrides: `src/legacy/runtime.js`, search `renderAdminRolePermissions`; defaults in `src/domain/defaultData.ts`
- Security checklist: `src/legacy/runtime.js`, search `renderSecurityChecklist`; shown in Admin → Systém → Ezop4
- Role menu visibility: `src/legacy/runtime.js`, search `renderRoleNavVisibility` and `navVisibleForCurrentUser`
- Mobile bottom navigation: `src/legacy/runtime.js`, search `getBottomNavModel` and `openMobileMoreNav`; styles in `src/styles/components.css`
- Mobile back gesture and top reset: `src/legacy/runtime.js`, search `mobileBackStep` and `scrollAppToTop`
- Notification center: `src/legacy/runtime.js`, search `buildNotifications`, `openNotificationsModal`, `snoozeNotification`, and `resolveIssueFromNotification`; styles in `src/styles/components.css`
- Dashboard stopped-work overview: `src/legacy/runtime.js`, search `dashboardStoppedWorkHtml` and `orderStopItems`; styles use `app-stop-*`
- Work queue cards and click-through: `src/legacy/runtime.js`, search `renderWorkQueue`, `queueCardHtml`, and `queueCardOpen`
- Secondary order actions menu: `src/legacy/runtime.js`, search `openOrderActionsModal` and `orderMoreButton`; styles in `src/styles/components.css` under `action-menu`
- Direct messenger: `src/legacy/runtime.js`, search `openMessengerModal` and `sendDirectMessage`; topbar button in `src/ui/shell.ts`; role gate is `use_messenger`
- Operator simple UI: `src/legacy/runtime.js`, search `operatorSimpleMode`
- Station detail layout: `src/legacy/runtime.js`, search `renderStationDetail`; styles in `src/styles/components.css` and `src/styles/mobile.css`
- Order timeline: `src/legacy/runtime.js`, search `orderTimelineItems` and `orderTimelineCardHtml`; styles use `order-timeline-*`
- Admin grouped navigation and desktop console layout: `src/legacy/runtime.js`, search `adminGroups`, `renderAdmin`, `activeAdminNav`, and `renderAdminSubTabs`; styles use `admin-shell`, `admin-sidebar`, `admin-tabs-nested`, and `admin-content-head` in `src/styles/components.css` plus mobile overrides in `src/styles/mobile.css`
- Admin order rows: `src/legacy/runtime.js`, search `renderAdminOrders` and `adminOrderRowOpen`
- Legacy UI wiring for station/order screens: `src/legacy/runtime.js`
- Shell HTML only: `src/ui/shell.ts`
- Visual styling: `src/styles/`
- Supabase/local storage facade: `src/services/storage.ts`
- Ezop4 table migration: `src/services/appStateMigration.ts`
- Repository boundary for production data: `src/services/productionRepository.ts`
- Supabase Auth boundary: `src/auth/supabaseAuth.ts`
- Audit log storage/cloud writer: `src/services/auditLog.ts`
- Lupa NET integration boundary: `src/services/lupaNetIntegration.ts`
- Lupa NET vendor checklist: `docs/LUPANET_INTEGRATION.md`
- Shared TypeScript data shapes: `src/state/types.ts`

## Current Runtime Boundary

`src/main.ts` injects `src/legacy/runtime.js` as a raw compatibility script. New pure business rules should go into small modules under `src/domain/` and be exposed to the runtime through narrow `window.EZOP_*` bridges.

Current bridges:

- `window.EZOP_FLOW`: production count and station flow rules.
- `window.EZOP4_TO_TABLES`: converts compatible app state to Ezop4 table rows.
- `window.EZOP4_AUTH`: auth mode helpers and Supabase Auth adapter.
- `window.EZOP4_AUDIT`: local audit log and optional Supabase `audit_logs` writer.
- `window.EZOP4_LUPA_NET`: Lupa NET config, readiness checks and export package builder.

## Data Rule

When a station finishes, the next station receives `OK + Oprava`. Scrap does not continue. This lets repaired boards become OK on the next station while preserving scrap loss.

The order workflow follows the array order in `order.stations`. Do not sort it by `stId` unless the user explicitly wants to reset the route.
