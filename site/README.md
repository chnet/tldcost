# site

Statische Astro-Site von tldcost: TLD-Auswahl, Preistabelle, gesamter Zustand in der URL.
Eine einzige Insel (`src/components/PriceTable.tsx`, Preact + `@tanstack/preact-table`).
Keine Cookies, kein Storage, keine externen Fonts oder Skripte.

| Befehl (in `site/`) | Zweck |
|---|---|
| `npm run build` | baut `@tldcost/core`, dann die Site aus `../data` nach `dist/` |
| `npm run dev` | Dev-Server |
| `npm test` | Unit-Tests (vitest): Sortierung, URL-State, Zeilenaufbau |
| `npm run check` | `astro check` (Typen inkl. `.astro`) |
| `npm run test:e2e` | baut zwei Fixture-Varianten nach `dist-e2e/` (mit/ohne Betreiber-Flag) und startet Playwright; lokal mit installiertem Chrome: `PW_CHANNEL=chrome npm run test:e2e`. Ports 4401/4402, andere mit `E2E_PORT_A`/`E2E_PORT_B`. Zwei Läufe gleichzeitig nur aus zwei Checkouts (beide bauen nach `dist-e2e/`), der zweite mit anderen Ports; ein belegter Port bricht den Lauf ab |
| `npm run lhci` | Lighthouse (mobil) auf `dist-e2e/a`, Schwellen in `lighthouserc.json`; installiert `@lhci/cli` aus `../tools/lhci` (eigene `package-lock.json` außerhalb der Workspaces, weil dessen `express` `cookie@0.7` mitbringt und Astros Prerender `cookie@2` braucht) |
| `node tests/check-build.mjs dist ../data` | nach dem Build: API-Dateien gegen OpenAPI, TLD-Seiten und Sitemap vollständig (auch in CI, zusätzlich für `dist-e2e/a`) |

Umgebungsvariablen beim Build: `TLDCOST_DATA_DIR` (Default `../data`), `TLDCOST_OUT_DIR` (Default `./dist`).

Astro speichert die Markdown-Inhalte im Content-Layer-Cache `node_modules/.astro/data-store.json`
(in `site/`). Nach einer Änderung an einem Markdown-Plugin (`src/lib/strip-html-comments.mjs`,
`src/lib/table-regions.mjs`, `markdown.processor` in `astro.config.mjs`) kann ein lokaler Build noch
altes HTML liefern: Datei löschen und neu bauen. CI baut aus einem frischen Checkout.

## Sortierung

`src/lib/sort.ts`, Regeln wie auf der Methodik-Seite: fehlende Werte immer zuletzt; sonst der Wert der
Sortierspalte im gewählten Modus (brutto/netto); bei Gleichstand zuerst die Summe 3 Jahre aufsteigend
(fehlend zuletzt), dann die Anbieter-ID aufsteigend, beides auch bei absteigender Sortierung;
Ja/Nein aufsteigend = „ja“ zuerst; Whois-Privacy: „kostenlos“ = „entfällt“ vor „kostenpflichtig“ vor „nicht angeboten“. Der Comparator sieht nur `SortableRow`
(ohne Betreiber-Flag). `tests/e2e/operator-neutral.spec.ts` vergleicht jede Spalte × Richtung × Modus ×
TLD zwischen den Builds mit und ohne Flag.

## URL-Parameter

`tld`, `sort`, `dir` (`asc`|`desc`), `cols` (kommagetrennte Spalten-IDs), `vat` (`gross`|`net`).
Ungültige Werte fallen auf den Default zurück; Defaults stehen nicht in der URL; feste Reihenfolge.
Spalten-IDs: `src/lib/columns.ts` (öffentlich, nicht umbenennen).

## Seiten und API

- `/tld/<tld>/`: eine statische Seite je TLD mit Angeboten (Tabelle serverseitig gerendert, nur diese
  TLD), auf Deutsch und Englisch (`/en/tld/<tld>/`).
- `/api/v1/`: statische JSON-Dateien (`all.json`, `tlds.json`, `offers/<tld>.json`, `openapi.json`,
  `schema/*.schema.json`), gebaut in `src/lib/api.ts` und `src/lib/openapi.ts`. Rohdaten unverändert,
  berechnete Werte nur im Block `derived` (dieselbe Funktion wie die Tabelle). Doku für Menschen: `/api/`.
- `404.html` (zweisprachig, CloudFront liefert sie für jeden fehlenden Pfad), `robots.txt`; `sitemap.xml` schreibt `integrations/sitemap.mjs` nach dem Build aus den
  tatsächlich gebauten Seiten.
- `tests/api-validator.mjs` prüft `openapi.json` gegen das offizielle OpenAPI-3.1-Schema
  (`tests/vendor/`) und die Antworten gegen die OpenAPI.

## Sprachen (Archiv-Issue 33)

- Deutsch unter `/`, Englisch unter `/en/` mit demselben Pfad (`/portfolio/` ↔ `/en/portfolio/`).
  Kein Cookie, kein Storage, keine Weiterleitung nach Browsersprache. Jede Seite mit Gegenstück hat
  `hreflang` de/en/x-default (x-default = Deutsch); `canonical` zeigt immer auf die Seite selbst.
- Sprachumschalter (Design System LanguageSwitch, `.tc-switch[data-lang-switch]`): echte Links DE/EN,
  ohne JavaScript sichtbar. `public/theme-init.js` hängt beim Klick die aktuelle Query an
  (`tld`, `vat`, `cols`, `f`, `theme`, `basket` …); die URL-Parameter sind sprachneutral.
- Texte: `src/i18n/de.ts` / `en.ts` (Texte der Inseln) und `site-de.ts` / `site-en.ts` (nur im Build:
  Layout, Seitentexte, Fußnoten der Tabelle). Gleiche Schlüssel und Signaturen, geprüft von `tsc`
  und `tests/unit/i18n.test.ts`. Formate in `src/i18n/format.ts` (Deutsch wie bisher, Englisch en-GB:
  €4.07, 13 Nov 2026).
- Jede Insel hat einen Einstieg je Sprache (`PriceTableDe.tsx`/`PriceTableEn.tsx`,
  `BasketCalculatorDe.tsx`/`…En.tsx`), damit eine Seite nur ihren Katalog lädt.
- Datentext (Aktionsbedingungen, AGB-Notizen, `country_note`, `collection.reason`) bleibt Deutsch und
  wörtlich; auf englischen Seiten steht er in `lang="de"` mit englischem Vorsatz (`NoteText`).
- Textseiten: Übersetzungen in `docs/pages/en/<slug>.md` mit `lang: en` und `source_sha256` (in
  Anführungszeichen; sha256 der deutschen Datei, aus der übersetzt wurde). Ändert sich die deutsche
  Datei, zeigt die englische Seite einen Hinweis und der Build warnt (kein Abbruch). Das Changelog wird
  nicht übersetzt; fehlt eine Übersetzung, verlinkt die englische Fußzeile die deutsche Seite
  („(German)“).
- `tests/check-i18n.mjs` (aus `check-build.mjs`): Seitenpaare, hreflang, canonical, `<html lang>` und
  keine deutschen UI-Wörter auf englischen Seiten außerhalb von `lang="de"`.
