# EZOP4 - postup vylepseni aplikace

## Cil

Z aplikace postupne udelat pouzitelny vyrobni system pro dilnu i kancelar, bez kopirovani stareho desktopoveho EZOPu 1:1. Kazde vylepseni musi zjednodusit praci operatora, mistra nebo pripravy vyroby.

## Etapa 1 - poznamky a znalost vyrobku

- Soukrome a verejne poznamky k vyrobe.
- Poznamka ulozena k vyrobku se zobrazi i u dalsi zakazky stejneho zakaznika a vyrobku.
- Verejna poznamka upozorni vybrana stanoviste, soukroma zustane jen autorovi.
- V poznamce musi byt videt, jestli je aktualni, soukroma nebo zdedena z minule zakazky.

## Etapa 2 - operator bez zbytecnych poli

- Operator vidi jen svoje stanoviste a svoje fronty.
- Zapis poctu se povoli az po prevzeti prace.
- Pozastaveni prace musi mit volitelny duvod.
- Dokonceni automaticky posune dostupne kusy na dalsi stanoviste.

## Etapa 3 - mistr a planovani

- Fronty pracovist podle priority, terminu a blokaci.
- Drag/drop zmena poradi v ramci fronty. Hotovo: mistr/admin muze menit poradi fronty vybraneho stanoviste pretazenim nebo tlacitky nahoru/dolu.
- Zobrazeni pretizenych stanovist a zakazek po terminu. Hotovo: dashboard mistra ukazuje rizika smeny, po terminu, blokace a pretizena pracoviste s proklikem do front.
- Rychly prehled, co stoji na materialu, dokumentaci nebo programu.

## Etapa 4 - pripravenost zakazky

- Semafor dokumentace, materialu, planzety, programu a pripravku. Hotovo: detail zakazky, seznam zakazek a fronty ukazuji pripravenost 0-6; TPV/mistr/vedeni/admin ji muze upravit.
- Blokace podle typu: material, dokumentace, program, zakaznik, kvalita.
- Historie, kdo blokaci zalozil a kdo ji odblokoval.

## Etapa 5 - databazovy rezim

- Prechod z app_state blobu na tabulky orders, order_stations, production_notes a product_memory.
- RLS pravidla podle roli a prirazeni stanovist.
- Audit vsech zmen poctu, stavu, poznamek a blokaci.

## Poradi realizace

1. Dokoncit poznamky k vyrobku a produktovou pamet.
2. Zpevnit operatorovy obrazovky a pravidla prevzeti prace.
3. Doplnit planovani front mistra.
4. Prepnout cteni a zapis zakazek z app_state na tabulkove API.
5. Pridat import/export a reporting pro vedeni.
