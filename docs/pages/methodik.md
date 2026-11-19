---
title: Methodik
slug: methodik
---

# Methodik

Diese Seite erklärt, welche Daten tldcost erhebt, wie die Tabelle sortiert und wie die Gesamtkosten berechnet werden. Sie erfüllt die Transparenzpflicht für Vergleiche nach § 5b Abs. 2 UWG: Hauptparameter des Rankings und ihre Gewichtung.

## Kurzfassung

- Wir zeigen Preise und Vertragsbedingungen von Domain-Anbietern in einer Tabelle, eine Zeile je Anbieter.
- **Standard-Sortierung:** Gesamtkosten über 3 Jahre, brutto, aufsteigend.
- Jede Spalte ist sortierbar. Die gewählte Sortierung steht in der URL und ist damit teilbar und reproduzierbar.
- Es gibt **keinen Score, keine Empfehlung, keinen „Testsieger“ und keine Bewertungen**.
- Kein Anbieter zahlt für Aufnahme, Platzierung oder Darstellung. Es gibt keine Affiliate-Links und kein Tracking.
- Freiwillige Spenden über [GitHub Sponsors](https://github.com/sponsors/chnet) haben keinen Einfluss auf Aufnahme oder Reihenfolge.
- :::nur-oeffentlich
  Jeder Wert hat eine öffentliche Quelle, einen Zeitstempel und einen Beleg. Alle Daten liegen offen im [GitHub-Repository](tldcost:repo/).
  :::
  :::nur-privat
  Jeder Wert hat eine öffentliche Quelle, einen Zeitstempel und einen Beleg. Alle Daten liegen offen als JSON unter [/api/](/api/) (Lizenz [CC BY 4.0](/lizenz/)).
  :::

## Hauptparameter und Gewichtung

Die Reihenfolge der Zeilen ergibt sich **in erster Linie aus der Sortierspalte**; bei Gleichstand gelten die Regeln unten. Es gibt keine Gewichtung mehrerer Kriterien und keine manuelle Platzierung.

| Einstellung | Standard | Änderbar |
|---|---|---|
| Sortierspalte | Gesamtkosten 3 Jahre | jede Spalte |
| Sortierrichtung | aufsteigend (günstigster zuerst) | ja |
| Preisangabe | brutto (inkl. MwSt.) | Umschalter brutto/netto |
| Gesamtkosten | Summe über 2, 3 und 5 Jahre, je als eigene Spalte | über die Spaltenauswahl ein- und ausblendbar |

Bei gleichem Wert in der Sortierspalte gilt diese Reihenfolge, unabhängig von der Sortierrichtung:

1. Summe über 3 Jahre (`sum_3y`), aufsteigend, in der eingestellten Preisangabe (brutto oder netto).
2. Anbieter-ID (`providerId`), aufsteigend.

So entscheidet bei Gleichstand zuerst der Preis und nicht der Name. Kein Anbieter, auch nicht das Angebot des Betreibers, rückt wegen seines Namens nach vorn.

Fehlende Werte stehen immer am Ende, unabhängig von der Sortierrichtung.
Bei Ja/Nein-Spalten (z. B. SSL-Zertifikat, DNSSEC) bedeutet aufsteigend: „ja“ (inklusive, ohne Aufpreis) zuerst, dann „kostenpflichtig“ (der Anbieter bietet die Leistung nur gegen Aufpreis an; Quelle und, falls genannt, Preis stehen in den Details), dann „nein“.

**Whois-Privacy** (Schutz der Inhaberdaten im öffentlichen Whois/RDAP). Aufsteigend gilt diese Reihenfolge:

| Rang | Wert | Anzeige | Bedeutung |
|---|---|---|---|
| 1 | `free` | kostenlos | Der Anbieter schützt die Inhaberdaten ohne Aufpreis. |
| 1 | `n/a` | entfällt | Die Registry zeigt die Inhaberdaten ohnehin nicht öffentlich (z. B. .de). Gleichwertig mit „kostenlos“. |
| 2 | `paid` | kostenpflichtig | Der Anbieter bietet den Schutz nur gegen Aufpreis an. |
| 3 | `none` | nicht angeboten | Die Registry zeigt die Inhaberdaten, und der Anbieter bietet keinen Schutz an. |
| – | `null` | – | Nicht öffentlich belegt. Steht immer am Ende. |

## Gesamtkosten (TCO)

Die Tabelle zeigt die Gesamtkosten für 2, 3 und 5 Jahre als eigene Spalten. Für N Jahre (N = 2, 3 oder 5):

```
Summe_N = Einrichtungsgebühr + Preis Jahr 1 + Summe der Zahlungen, die in Jahr 2 bis N fällig werden
Ø pro Jahr = Summe_N / N
```

- Für Jahr 2 und 3 nutzen wir einen eigenen Preis, wenn der Anbieter einen abweichenden Preis nennt. Sonst gilt der reguläre Verlängerungspreis.
- Der Preis für Jahr 2 oder 3 gilt für die Zahlung, die in diesem Jahr fällig wird. Bei einer Mindestlaufzeit von 2 Jahren oder mehr wird in Jahr 2 nichts fällig, der Preis für Jahr 2 gilt dann also nicht.
- Ab Jahr 4 gilt immer der Verlängerungspreis.
- Transfer-Gebühren (Transfer-in, Transfer-out) zeigen wir in eigenen Spalten. In die Gesamtkosten der Tabelle fließen sie nicht ein, denn die Tabelle rechnet eine Neuregistrierung. Den Transfer bestehender Domains rechnet der [Portfolio-Rechner](#portfolio-rechner).

### Mindestlaufzeit länger als ein Jahr

Manche TLDs lassen sich nur für mehrere Jahre im Voraus registrieren oder verlängern, z. B. für 2 Jahre. Dann gilt:

- Die erste Zahlung deckt die ganze Mindestlaufzeit ab.
- In die Gesamtkosten über N Jahre zählen wir **alle Zahlungen, die innerhalb der N Jahre fällig werden**, jeweils in voller Höhe. Das ist der Betrag, den Sie in dieser Zeit tatsächlich zahlen.
- Der Ø pro Jahr bleibt Summe_N / N.
- Die Mindestlaufzeit steht in der Spalte „Mindestlaufzeit“.

Beispiel: Registrierung nur für 2 Jahre.

| Verlängerung | 2 Jahre | 3 Jahre | 5 Jahre |
|---|---|---|---|
| jährlich | 1 Zahlung (2 J) | 1 Zahlung (2 J) + 1 Verlängerung | 1 Zahlung (2 J) + 3 Verlängerungen |
| nur für 2 Jahre | 1 Zahlung (2 J) | 2 Zahlungen (je 2 J) | 3 Zahlungen (je 2 J) |

## Portfolio-Rechner

Der [Portfolio-Rechner](/portfolio/) rechnet ein ganzes Portfolio aus mehreren Endungen und Anzahlen (z. B. 10× .de, 3× .com, 5× .eu) über 1, 2, 3 oder 5 Jahre, je Anbieter.

- **Neuregistrierung:** je Domain die Gesamtkosten wie in der Tabelle (Summe_N), mal Anzahl. Ein Aktionspreis zählt nur für so viele Domains, wie der Anbieter je Endung oder je Kunde angibt; fehlt die Angabe, zählt er für eine einzige Domain je Anbieter, und zwar bei der Endung mit der kleinsten Ersparnis, alle anderen Domains zahlen in Jahr 1 den regulären Preis. Schreibt der Anbieter ausdrücklich, dass es für eine Endung keine Höchstzahl je Kunde gibt (wörtliches Zitat als Beleg), zählt der Aktionspreis für alle Domains dieser Endung und nicht gegen die Höchstzahl je Kunde. Nennt der Anbieter keinen regulären Preis für das erste Jahr, rechnen wir diese Domains im ersten Jahr mit seinem Verlängerungspreis und kennzeichnen das in einer Fußnote.
- **Transfer bestehender Domains:** Beim Transfer rechnen wir die Transfergebühr plus den Verlängerungspreis ab dem ersten Jahr, außer der Anbieter gibt an, dass der Transfer ein Jahr Laufzeit einschließt. Dann ist die erste Verlängerung im zweiten Jahr fällig. Diese Angabe belegen wir mit Quelle. Verlängert der Anbieter die Endung nur für mehrere Jahre auf einmal (z. B. .ai für 2 Jahre), ist unklar, welche Laufzeit der Transfer einschließt: Dann zeigen wir „Transferlaufzeit unklar“ und keinen Gesamtpreis. Aktionspreise für Neuregistrierungen gelten beim Transfer nicht. Die Einrichtungsgebühr zählt in beiden Fällen einmal je Domain.
- Fehlt einem Anbieter eine Endung oder eine nötige Angabe (z. B. der Transfer-Preis), bekommt er keinen Gesamtpreis. Die Zeile zeigt, was fehlt („fehlt“, „Transfer-Preis fehlt“, „Transferlaufzeit unklar“).
- Reihenfolge: nach Gesamtpreis aufsteigend, Anbieter ohne Gesamtpreis zuletzt. Wie in der Tabelle gibt es keine Empfehlung, und das Angebot des Portalbetreibers unterscheidet sich nur durch sein Badge.
- Die Ergebnistabelle lässt sich wie die Tabelle nach jeder Spalte sortieren und filtern (außer Land: nur filtern). Anbieter ohne Gesamtpreis stehen dabei immer am Ende, und ein Betragsfilter blendet sie nur aus, wenn Sie „k. A.“ ausdrücklich abwählen. Mit Filter markiert die Hervorhebung den niedrigsten Wert unter den angezeigten Anbietern.
- **Günstigste Kombination:** je Endung der günstigste Anbieter, bei Gleichstand alle. Das bedeutet mehrere Kundenkonten.
- Preise ohne Angabe zur Umsatzsteuer bleiben wie angegeben und tragen ihre Fußnote. Die Summe ist dann nicht als Bruttopreis zu lesen.
- Gerechnet wird im Browser mit denselben offenen Daten wie die Tabelle. Es wird nichts gespeichert, das Portfolio steht nur in der Adresse der Seite.

## Brutto und netto

- Standard ist **brutto inkl. der Umsatzsteuer, die der Anbieter einem Verbraucher in Deutschland berechnet** (in der Regel 19 %). Das entspricht der Preisangabe gegenüber Verbrauchern nach PAngV.
- Nennt ein Anbieter Nettopreise, rechnen wir mit dem Steuersatz des Anbieters auf brutto um.
- Der Umschalter „netto“ ist für Gewerbekunden gedacht.
- Preise in Fremdwährung rechnen wir mit dem Referenzkurs der Europäischen Zentralbank in Euro um. Kurs und Datum stehen beim Wert.
- **Preise eines anderen Marktes (Ausnahme):** Manche Anbieter erkennen das Land des Besuchers und zeigen unserem automatischen Abruf die Preise eines anderen Landes, ohne dass wir den deutschen Markt wählen können. Nur dann übernehmen wir diese Preise wörtlich mit Quelle, Abrufdatum und Zitat, derzeit nur US-Preise in US-Dollar. Wir rechnen sie zum Referenzkurs der Europäischen Zentralbank vom Abruftag (oder vom letzten Bankarbeitstag davor) in Euro um und schlagen 19 % Umsatzsteuer auf. Eine Fußnote kennzeichnet den Wert: „US-Preis, umgerechnet zum Kurs vom \<Datum\>, zzgl. 19 % MwSt.; der Preis für Kunden in Deutschland kann abweichen.“ In der Netto-Ansicht entfällt der Teil zur Umsatzsteuer: „US-Preis, umgerechnet zum Kurs vom \<Datum\>; der Preis für Kunden in Deutschland kann abweichen.“ In den Daten und in der API steht dabei der Markt (`foreign_market`).

## Aktionspreise

- „Jahr 1“ ist der **tatsächliche** Preis im ersten Jahr, einschließlich einer öffentlich angebotenen Aktion, aber **ohne Gutscheincode**.
- Eine Aktion übernehmen wir nur, wenn der Anbieter ihre Laufzeit (Beginn oder Ende) oder ihre Bedingungen nennt. Sonst gilt der reguläre Preis.
- Zusätzlich speichern wir den regulären Preis ohne Aktion.
- Aktionspreise erhalten ein Badge „Aktionspreis“. Bedingungen (z. B. „nur Neukunden“, Enddatum) stehen als Fußnote am Wert.
- Weil die Standard-Sortierung über 3 Jahre rechnet, kann ein günstiges erstes Jahr einen hohen Verlängerungspreis nicht verdecken.
- **Gutscheincodes zählen nicht.** Preise, die nur mit einem einzugebenden Code gelten, fließen nicht in die Gesamtkosten ein, auch wenn der Code öffentlich ist. Öffentliche Codes nennen wir höchstens als Fußnote. tldcost ist kein Gutschein-Portal.

## Quellen und Belege

Jeder Preis und jede Vertragsbedingung trägt:

| Feld | Bedeutung |
|---|---|
| `source_url` | öffentliche Seite des Anbieters, ohne Login abrufbar |
| `fetched_at` | Zeitpunkt der Erhebung |
| `method` | `api` (Preisliste/Schnittstelle des Anbieters), `scrape` (automatisch von der Webseite gelesen) oder `manual` (von Hand erfasst) |
| `evidence_hash` | Prüfsumme der abgerufenen Seite oder Antwort |
| `confidence` | `high`, `medium` oder `low`; Handeingaben ohne Beleg sind immer `low` |

Seit der Veröffentlichung des Repositorys am 19.11.2026 ist jede Änderung an den Daten ein Commit im öffentlichen Repository; die Git-Historie ist seitdem die vollständige Preishistorie. Ältere Stände (seit 13.11.2026) liegen im privaten Vorgänger-Repository. Dazu führt `data/history/` je Angebot einen Preisverlauf mit einem Eintrag je Preisänderung (Datum und Quelle); er beginnt mit dem Datenstand vom November 2026, ältere Preise enthält er nicht.

## Erhebung und Aktualisierung

| Stufe | Quelle | Intervall |
|---|---|---|
| A | strukturierte Preislisten oder Schnittstellen der Anbieter | wöchentlich (montags) |
| B | öffentliche Preisseiten der Anbieter (automatisch gelesen) | wöchentlich (montags) |
| C | Vertragsbedingungen und Funktionen aus AGB und Produktseiten, von Hand erfasst | Prüfung spätestens alle 90 Tage |

Regeln für die automatische Erhebung:

- Nur öffentlich sichtbare Preisseiten. Keine Umgehung von Login oder Bot-Schutz.
- Wir beachten `robots.txt` und rufen jede Seite höchstens einmal täglich ab.
- Höchstens eine Anfrage pro Sekunde je Anbieter.
- Unser Abrufprogramm gibt sich im User-Agent als `tldcost-bot` zu erkennen, mit Link zum Projekt: `tldcost-bot (+https://tldcost.io/methodik/)`.
- Ändert sich ein regulärer Preis (Jahr 1 ohne Aktion, Verlängerung) um mehr als 30 % oder steigt eine Gebühr für Einrichtung oder Transfer um mehr als 30 % oder erstmals über 0, übernehmen wir den neuen Wert nicht automatisch. Ein Mensch prüft ihn vorher.
- Aktionspreise lösen diese Prüfung nicht aus, weil Aktionen laufend beginnen und enden. Wir übernehmen sie automatisch mit Badge, aber nur mit Angabe zu Laufzeit oder Bedingungen (siehe [Aktionspreise](#aktionspreise)).
- Schlägt eine Erhebung fehl, bleibt der letzte geprüfte Wert stehen. Der Datenstand ist bei jedem Wert sichtbar.

## Erhebung je Anbieter

Die Tabelle entsteht beim Erstellen der Seite aus den Daten. Wie ein Preis erhoben wurde, steht in jedem Angebot (`method`, siehe [Quellen und Belege](#quellen-und-belege)). Hat ein Anbieter keine Angebote, steht der Grund dabei.

::erhebung-je-anbieter

## Anbieterauswahl

Aufgenommen werden Anbieter, die

- Domains an Endkunden in Deutschland verkaufen oder als internationale Preisreferenz dienen, und
- ihre Preise öffentlich und ohne Login nennen und bei denen Domains ohne weiteren Vertrag (z. B. Hosting) bestellbar sind.

Welche Anbieter wie erhoben werden und warum einzelne keine Angebote haben, steht unter [Erhebung je Anbieter](#erhebung-je-anbieter).
Die Aufnahme ist nicht käuflich. Auf Wunsch eines Anbieters entfernen wir seine Angaben umgehend.
Die vollständige Liste steht in [`data/providers/`](tldcost:repo/tree/main/data/providers).
Fehlt ein Anbieter, kann ihn jeder vorschlagen: [Anbieter vorschlagen](tldcost:report/anbieter).

## Eigenes Angebot des Betreibers

tldcost wird von der CHnet Solutions Plus UG betrieben. Sie verkauft unter **chnet.domains** selbst Domains.

- chnet.domains steht als **gewöhnliche Zeile** in der Tabelle, mit dem sichtbaren Badge „Angebot des Portalbetreibers“.
- Für chnet.domains gelten dieselbe Erhebung, dieselben Quellenregeln und dieselbe Sortierung wie für alle anderen.
- Es gibt keine Hervorhebung. Automatische Tests prüfen, dass die Sortierung nach jeder Spalte mit und ohne Betreiber-Badge dieselbe Reihenfolge ergibt.

## Was wir bewusst nicht zeigen

- **Bewertungen und Sterne.** Ihre Echtheit können wir nicht prüfen.
- **Support-Qualität.** Sie ist nicht objektiv messbar.
- **Empfehlungen oder Gesamtnoten.**

## Bekannte Lücken

- Die Auswahl der Anbieter und TLDs ist nicht vollständig.
- Von Hand erfasste Vertragsbedingungen können bis zu 90 Tage alt sein. Das Datum steht beim Wert.
- Individuelle Konditionen (Reseller-Preise, Mengenrabatte, Kundenrabatte) erfassen wir nicht.
- **Anbieter außerhalb der EU:**
  - Fremdwährungen rechnen wir mit dem Referenzkurs der Europäischen Zentralbank vom Tag der Erhebung um. Kurs und Datum stehen beim Wert.
  - Ihr tatsächlicher Endpreis kann abweichen, weil Ihre Zahlungsart einen anderen Kurs oder Gebühren verwendet.
  - Ob ein Anbieter außerhalb der EU deutschen Verbrauchern Umsatzsteuer berechnet, ist nicht immer erkennbar. Nennt der Anbieter keine Umsatzsteuer, zeigen wir seinen Preis ohne Aufschlag und kennzeichnen ihn mit einer Fußnote. Der Netto-Umschalter ändert diesen Preis nicht.
- Maßgeblich ist immer das Angebot auf der Seite des Anbieters.

## Fehler melden und korrigieren

Über „Fehler melden“ in jeder Tabellenzeile oder direkt: [Fehler melden](tldcost:report/preis). Korrekturen übernehmen wir nur mit öffentlicher Quelle, auch wenn sie vom Anbieter selbst kommen.
Bestätigt ein Anbieter seine Daten und wurde seine Zugehörigkeit geprüft, erhält die Zeile das Badge „Anbieter-bestätigt“.
