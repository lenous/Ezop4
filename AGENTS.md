# EZOP 3 Contributor Notes

Start with `docs/CODEMAP.md` and edit the smallest relevant module first. Avoid loading all of `src/legacy/runtime.js` unless the UI wiring itself must change.

Keep production math in `src/domain/productionFlow.ts`; the legacy runtime should only call those helpers.

Keep seed/demo data in `src/domain/defaultData.ts`. Do not paste large data arrays back into `src/legacy/runtime.js`.

## Ezop 4 Codex Rules

- Pracuj usporně s kontextem.
- Nejprve zkontroluj jen soubory nutne pro dany ukol.
- Bez vyslovneho pokynu neprochazej cely projekt.
- Bez vyslovneho pokynu nedelej refaktor.
- Nemen nazvy funkci, databazovych tabulek ani sloupcu.
- Pred upravou napis strucny plan.
- Po uprave vypis pouze zmenene soubory a duvod zmeny.
- Pokud neco nevis, napis co je potreba overit.

## Ezop 4 Task Template

Kdyz uzivatel zada ukol pro Ezop 4, dodrzuj tato omezeni:

- Pracuj pouze v souborech, ktere uzivatel vyjmenuje, pokud nejake uvede.
- Neprochazej cely projekt, pokud to neni nutne.
- Nedelej refaktor.
- Nemen databazove nazvy, tabulky ani sloupce.
- Neinstaluj nove balicky.
- Nejdriv napis strucny plan a seznam souboru, ktere potrebujes otevrit.
- Potom proved jen minimalni zmenu.
- Na konci vypis zmenene soubory.
