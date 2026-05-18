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
- Auth port a helpery pro Supabase Auth přihlášení
- přepínač Demo login / Supabase Auth v Admin → Ezop4
- přísný Supabase Auth režim bez automatického demo fallbacku
- automatické uzamčení relace po neaktivitě podle nastavení aplikace
- admin přepínače viditelnosti funkcí a kompaktní zobrazení pokročilých karet
- admin správa rolí a vypínání vybraných oprávnění bez úpravy kódu
- admin nastavení viditelnosti menu podle role a režim aplikace pro jednodušší provoz
- rozdílná navigace pro mobil a PC: desktop má plnou horní navigaci, mobil kratší spodní lištu s tlačítkem Více
- mobilní gesto zpět tahem od levého okraje a automatický návrat nahoru při přepnutí obrazovky
- notifikační centrum v horní liště pro problémy, vzkazy, předání směny, blokace a systémová oznámení
- messenger pro přímou komunikaci uživatel–uživatel mimo stanoviště; admin ho může vypnout podle role, nastavit délku zprávy a audit neukládá obsah zpráv
- jednoduchý režim operátora se sbalenými podpůrnými kartami
- admin správa rozdělená do skupin: Uživatelé, Výroba, Data, Integrace a Systém
- audit log základ v Admin → Audit pro počty, stavy, poznámky, problémy, programy a úpravy zakázek
- integrační příprava pro Lupa NET v Admin → Lupa NET

UI zatím běží přes kompatibilní runtime z Ezop3. To je záměr: Ezop4 se bude přepisovat po vrstvách, aby stabilní výroba nespadla kvůli velkému jednorázovému přepisu.

## Supabase

1. V Supabase vytvořte nebo otevřete projekt.
2. V SQL Editoru spusťte `schema.sql`.
3. Zapněte Authentication → Email provider.
4. Pro každého uživatele vytvořte účet v Auth.
5. Do tabulky `profiles` vložte řádek s `user_id`, `login`, `role`, `name`.
6. V aplikaci otevřete Admin → Ezop4 a přepněte režim přihlášení na Supabase Auth.
7. Nouzový demo fallback nechte vypnutý pro ostrý provoz.

Bezpečnostní pravidla jsou v `docs/SECURITY.md`. Poznámka: GitHub účet ani GitHub repozitář nejsou zdroj uživatelů aplikace. GitHub slouží pro kód a deploy. Sdílené produkční účty musí být v Supabase Auth a v tabulce `profiles`; demo účty vytvořené v aplikaci jsou lokální pro konkrétní prohlížeč/zařízení.

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

## AI přehled zakázky

EZOP4 má připravený serverový OpenAI endpoint pro stručné shrnutí zakázky, rizik a doporučených dalších kroků. API klíč se načítá ze serverového prostředí jako `OPENAI_API_KEY` a neposílá se do prohlížeče.

Lokálně se používá `.env.local`:

```bash
OPENAI_API_KEY=...
```

AI přehled je dostupný v detailu zakázky pro role, které mohou zakázky řídit nebo vyhodnocovat. Role `operator` má jen náhled a nemůže měnit počty, stavy ani produktovou paměť.

## Lupa NET

EZOP4 má připravený integrační modul pro Lupa NET:

- Admin → Lupa NET: konfigurace režimu, směru toku dat a výchozího mapování polí
- JSON export zakázek, průběhu stanovišť a počtů pro ověření s dodavatelem
- `integration_settings` a `integration_outbox` v `schema.sql` pro budoucí serverovou synchronizaci
- dodavatelský checklist v `docs/LUPANET_INTEGRATION.md`

Veřejná dokumentace Lupa NET neuvádí konkrétní API kontrakt, proto se zatím nepoužívají pevné endpointy ani ERP přihlašovací údaje v prohlížeči.

## Další doporučený milník

1. Získat od dodavatele Lupa NET API/CSV kontrakt a potvrdit mapování polí.
2. Přepnout čtení zakázek z `app_state` na tabulky `orders` a `order_stations`.
3. Zapisovat změny počtů do `station_quantity_events` a `integration_outbox`.
4. Přesunout problémy a poznámky z legacy runtime do feature modulů.
5. Přidat automatické testy pro workflow kusů, oprávnění a integrační export.
