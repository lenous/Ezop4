# EZOP 4

Produkčnější verze mobilního výrobního EZOPu pro elektronickou výrobu. Ezop4 začíná ze stabilní Ezop3 aplikace, ale přidává základ pro ostrý provoz: tabulkovou Supabase databázi, Supabase Auth profily, audit log a migrační vrstvu z původního `app_state`.

## Spuštění

```bash
npm install
npm run dev
```

Výchozí dev server běží na [http://localhost:8085](http://localhost:8085).

## Build

```bash
npm run build
```

## Stav Ezop4

Hotovo v prvním milníku:

- samostatný lokální projekt `Ezop4`
- port `8085`, PWA identita `EZOP 4`
- produkční `schema.sql` s tabulkami pro zakázky, stanoviště, problémy, poznámky, audit, profily a login události
- RLS policy základ pro Supabase Auth role
- TypeScript repository rozhraní v `src/services/productionRepository.ts`
- migrační převod `app_state` do tabulkových JSON exportů
- Auth port a helpery pro budoucí Supabase Auth přihlášení
- přepínač Demo login / Supabase Auth v Admin → Ezop4
- audit log základ v Admin → Audit pro počty, stavy, poznámky, problémy, programy a úpravy zakázek

UI zatím běží přes kompatibilní runtime z Ezop3. To je záměr: Ezop4 se bude přepisovat po vrstvách, aby stabilní výroba nespadla kvůli velkému jednorázovému přepisu.

## Supabase

1. V Supabase vytvořte nebo otevřete projekt.
2. V SQL Editoru spusťte `schema.sql`.
3. Zapněte Authentication → Email provider.
4. Pro každého uživatele vytvořte účet v Auth.
5. Do tabulky `profiles` vložte řádek s `user_id`, `login`, `role`, `name`.
6. V aplikaci otevřete Admin → Ezop4 a přepněte režim přihlášení na Supabase Auth.

Role:

- `operator`
- `tpv`
- `dispatcher`
- `management`
- `admin`

## Migrace z Ezop3

Pokud máte export původního stavu jako JSON:

```bash
npm run migrate:app-state -- ./export.json ./migration-output
```

Skript vytvoří JSON soubory:

- `orders.json`
- `order_documents.json`
- `order_stations.json`
- `production_notes.json`
- `issues.json`
- `issue_recipients.json`
- `product_memory.json`

Tyto soubory odpovídají tabulkám v `schema.sql` a lze je použít jako seed/import do Supabase.

## Audit

V kompatibilním režimu se audit ukládá lokálně do prohlížeče. V Supabase Auth režimu se aplikace pokusí stejnou událost uložit také do tabulky `audit_logs`. Audit neukládá lokální hesla ani login logy.

## Další doporučený milník

1. Přepnout čtení zakázek z `app_state` na tabulky `orders` a `order_stations`.
2. Zapisovat změny počtů do `station_quantity_events`.
3. Přesunout problémy a poznámky z legacy runtime do feature modulů.
4. Přidat automatické testy pro workflow kusů a oprávnění.
