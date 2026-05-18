# Bezpecnost Ezop4

## Aktualni pravidla

- Demo login je jen pro testovani a lokalni provoz v jednom prohlizeci.
- Pro ostrou verzi zapnete Admin -> Ezop4 -> Supabase Auth.
- V Supabase Auth rezimu je automaticky demo fallback vypnuty. Nouzove ho muze admin zapnout jen lokalne a docasne.
- Role pro ostrou verzi se berou z tabulky `profiles`, ne z GitHubu ani z lokalniho seznamu uzivatelu.
- Databazove pristupy musi byt chranene pres Supabase RLS v `schema.sql`.
- Audit log v databazi smi zapisovat jen zaznam za aktualniho prihlaseneho uzivatele.
- Relace se automaticky uzamkne po neaktivite podle `APP_SETTINGS.lockTimeout`.
- Admin muze funkce skryt pres feature flags, ale produkcni ochrana prav musi byt porad v RLS/backendu.

## Co nedavat do GitHubu

- service role key
- hesla
- interni VPN/API tokeny
- Lupa NET pristupove udaje
- exporty realnych zakazek se zakaznickymi daty

## Doporuceny ostrý provoz

1. Spustit `schema.sql` v Supabase SQL Editoru.
2. Vytvorit uzivatele v Supabase Authentication.
3. Doplnit tabulku `profiles` s rolemi a aktivnimi ucty.
4. Zapnout Supabase Auth v Admin -> Ezop4.
5. Nechat nouzovy demo fallback vypnuty.
6. Nastavit automaticke zamceni relace v Admin -> Nastaveni.
7. Pravidelne kontrolovat Admin -> Audit a login logy.
8. GitHub repozitar pro ostrou firmu drzet jako private, pokud obsahuje interni procesy.

## Zbyvajici rizika

- Dokud je cast aplikace v kompatibilnim `app_state` rezimu, je to prechodova vrstva. Produkcni data maji postupne prejit do tabulek `orders`, `order_stations`, `production_notes`, `issues` a `audit_logs`.
- Frontendove kontroly roli jsou jen UX. Skutecnou ochranu musi delat Supabase RLS nebo budouci backend.
