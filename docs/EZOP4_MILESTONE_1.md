# Ezop4 Milestone 1

## Cíl

Připravit aplikaci na ostrý provoz bez riskantního jednorázového přepisu UI.

## Architektura

- UI: zatím kompatibilní Ezop3 runtime.
- Data: nová tabulková Supabase vrstva v `schema.sql`.
- Auth: připravený port v `src/auth/supabaseAuth.ts`.
- Repository: aplikační rozhraní v `src/services/productionRepository.ts`.
- Migrace: převod z `app_state` v `src/services/appStateMigration.ts` a `scripts/app-state-to-table-json.mjs`.

## Zásada další práce

Každá další úprava má jít přes menší moduly:

- výrobní matematika do `src/domain/productionFlow.ts`
- data do `src/services/productionRepository.ts`
- přihlášení do `src/auth/`
- nové obrazovky do `src/features/`

Legacy runtime se má postupně zmenšovat, ne dál růst.
