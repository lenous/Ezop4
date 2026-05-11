# EZOP 4 Code Map

Use this map before opening large files. It keeps future changes focused and cheaper.

## Most Common Changes

- Production count rules: `src/domain/productionFlow.ts`
- Demo users, orders, stations and seed notes: `src/domain/defaultData.ts`
- Order station sequence UI: `src/legacy/runtime.js`, search `manageStationsModal`
- Memory cleanup rules: `src/legacy/runtime.js`, search `cleanupAppMemory`
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
