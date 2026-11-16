---
title: Changelog
slug: changelog
---

<!--
Text für die Changelog-Seite. Manuell gepflegt wird der Abschnitt „Änderungen an der Methodik“.
Die Datenänderungen stehen ab der Veröffentlichung in der Git-Historie von data/ (ältere Stände im privaten
Vorgänger-Repository); eine generierte Liste auf der Seite gibt es
noch nicht. Kommt sie, diesen Text anpassen.
-->

# Changelog

## Datenänderungen

:::nur-oeffentlich
<!-- TODO C4: Datum der Veröffentlichung -->
Ab der Veröffentlichung des Repositorys ist jede Änderung an den Daten von tldcost ein Commit im Ordner [`data/`](tldcost:repo/tree/main/data); die [Git-Historie von `data/`](tldcost:repo/commits/main/data) ist ab da die vollständige Preishistorie. Ältere Stände (seit 13.11.2026) liegen im privaten Vorgänger-Repository. Jeder Commit zeigt den alten und den neuen Wert, die Quelle und den Zeitpunkt.

Nach Anbieter oder TLD filtern Sie über den Pfad in der Git-Historie, zum Beispiel:

- alle Änderungen eines Anbieters: `data/offers/<anbieter>/` (etwa [`data/offers/netcup/`](tldcost:repo/commits/main/data/offers/netcup))
- eine TLD bei einem Anbieter: `data/offers/<anbieter>/<tld>.json`
- Vertragsbedingungen eines Anbieters: `data/providers/<anbieter>.json`
:::

:::nur-privat
<!-- TODO C4: Datum der Veröffentlichung -->
Jede Datenänderung wird versioniert. Den aktuellen Stand mit Datum und Quelle je Wert liefert [`/api/v1/all.json`](/api/v1/all.json).
Ab der Veröffentlichung des Repositorys ist jede Änderung an den Daten ein Commit im öffentlichen Repository; die Git-Historie ist ab da die vollständige Preishistorie. Ältere Stände (seit 13.11.2026) liegen im privaten Vorgänger-Repository.
:::

## Arten von Änderungen

| Art | Herkunft |
|---|---|
| **Preisänderung** | wöchentliche automatische Erhebung |
| **Datenkorrektur** | Hinweis per E-Mail oder über GitHub (Issue oder Pull Request), von uns geprüft |
| **Neuer Anbieter oder neue TLD** | Erweiterung des Datensatzes |
| **Anbieter-bestätigt** | Anbieter hat seine Daten bestätigt, Zugehörigkeit geprüft |

## Änderungen an der Methodik

Änderungen daran, wie wir erheben, rechnen oder sortieren, tragen wir hier von Hand ein.

- 14\. November 2026 — Erste Veröffentlichung. Siehe [Methodik](/methodik/). Enthalten sind:
  - die Preistabelle mit TLD-Auswahl, Sortierung nach jeder Spalte, Spaltenauswahl und Umschalter brutto/netto; die Ansicht steht in der Adresse und lässt sich teilen,
  - Zeilen-Details mit Beleg, Datenstand, Aktionsbedingungen, AGB-Fundstelle und dem Link „Fehler melden“, dazu Fußnoten je Zelle,
  - eine eigene Seite je TLD unter `/tld/<tld>/`,
  - die offene Daten-Schnittstelle unter [`/api/v1/`](/api/) (statische JSON-Dateien mit OpenAPI-Beschreibung).
- 15\. November 2026 — [Portfolio-Rechner](/portfolio/): Gesamtpreis je Anbieter für mehrere Endungen und Anzahlen über 1, 2, 3 oder 5 Jahre, neu registriert oder per Transfer. Neue Regel für den Transfer: Transfergebühr plus Verlängerungspreis ab dem ersten Jahr, außer der Anbieter gibt an, dass der Transfer ein Jahr Laufzeit einschließt (siehe [Methodik](/methodik/#portfolio-rechner)). Die Gesamtkosten der Tabelle ändern sich nicht.
- 15\. November 2026 — Ja/Nein-Merkmale können jetzt „kostenpflichtig“ sein: Der Anbieter bietet die Leistung nur gegen Aufpreis an. Die Details der Zeile nennen Quelle und, falls angegeben, Preis; in die Gesamtkosten fließt der Aufpreis nicht ein. „ja“ heißt bei diesen Merkmalen: inklusive, ohne Aufpreis. Die Spalte „SSL kostenlos“ heißt jetzt „SSL-Zertifikat“. Schnittstelle: `features.*` können jetzt `"paid"` sein; `schema_version` 2 (siehe [Methodik](/methodik/)).
