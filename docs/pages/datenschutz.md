---
title: Datenschutz
slug: datenschutz
---

<!--
Für tldcost geschrieben (Vorgaben des Betreibers, 2026-11-13). Beschreibt nur, was tldcost tatsächlich tut:
infra/lib/site-stack.ts (CloudFront enableLogging: false, kein S3-Zugriffsprotokoll),
site/tests/e2e/privacy.spec.ts (keine Cookies, kein Storage, keine Anfragen an fremde Server).
Ändert sich die Technik, muss dieser Text mitgeändert werden.
-->

# Datenschutzerklärung

## Kurzfassung

- **Keine Cookies, kein Local Storage, kein Tracking, keine Analyse-Werkzeuge.**
- Keine Schriften, Skripte oder Bilder von fremden Servern.
- Kein Login, kein Kontaktformular, kein Newsletter, kein Chatbot.
- Wir speichern keine Zugriffsprotokolle. Nur unser Hosting-Dienstleister verarbeitet die technisch nötigen Verbindungsdaten, um die Seite auszuliefern.
- Fehlermeldungen und Korrekturen erreichen uns über GitHub oder per E-Mail. Das Repository ist seit dem 19.11.2026 öffentlich.

## 1. Verantwortlicher

CHnet Solutions Plus UG (haftungsbeschränkt), vertreten durch den Geschäftsführer Christian Holbein
Bahnhofstr. 2, 37339 Breitenworbis, Deutschland
E-Mail: [hello@chnet.solutions](mailto:hello@chnet.solutions)

Kontakt für Datenschutzfragen: [privacy@chnet.solutions](mailto:privacy@chnet.solutions)

Ein Datenschutzbeauftragter ist nicht benannt (keine Pflicht nach Art. 37 DSGVO / § 38 BDSG).

Weitere Angaben: [Impressum](/impressum).

## 2. Hosting und Auslieferung

Die Website besteht nur aus statischen Dateien. Sie liegen bei Amazon Web Services (AWS):

- **Amazon S3** speichert die Dateien in der AWS-Region eu-west-1 (Irland).
- **Amazon CloudFront** liefert sie aus. CloudFront ist ein weltweites Netz von Servern. Ein Aufruf wird meist vom nächstgelegenen Server beantwortet, bei Aufrufen aus Deutschland in der Regel von einem Server in Europa. Eine Verarbeitung außerhalb der EU ist nicht ausgeschlossen.

Vertragspartner ist die Amazon Web Services EMEA SARL, 38 Avenue John F. Kennedy, L-1855 Luxemburg. Mit AWS besteht ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO (AWS-Datenschutz-Nachtrag zur DSGVO, Teil der AWS Service Terms).

**Verbindungsdaten:** Damit Ihr Browser die Seite erhält, verarbeitet AWS technisch nötige Daten, vor allem Ihre IP-Adresse, dazu Zeitpunkt, aufgerufene Adresse und die Browser-Kennung. AWS nutzt sie, um die Seite auszuliefern und vor Angriffen zu schützen.

**Keine Zugriffsprotokolle:** Wir haben die Zugriffsprotokolle von CloudFront und S3 nicht eingeschaltet. Wir speichern also keine Protokolle mit IP-Adressen und werten keine Aufrufe aus.

**Rechtsgrundlage:** Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse ist die sichere und stabile Auslieferung der Website.

**Drittland:** Soweit CloudFront Daten außerhalb der EU verarbeitet, gelten die Standardvertragsklauseln im Auftragsverarbeitungsvertrag mit AWS. AWS ist außerdem unter dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO).

## 3. Keine Cookies, kein Speichern auf Ihrem Gerät

Wir setzen keine Cookies und nutzen weder Local Storage noch Session Storage. Wir speichern nichts auf Ihrem Gerät und lesen nichts von dort aus. Ihre Einstellungen in der Tabelle (TLD, Sortierung, Spalten, brutto/netto) stehen nur in der Adresse (URL) der Seite. Deshalb gibt es keinen Cookie-Hinweis.

## 4. Kein Tracking, keine Inhalte von Dritten

- Wir setzen keine Analyse- oder Tracking-Werkzeuge ein, keine Werbung und keine Social-Media-Plugins.
- Die Website lädt keine Schriften, Skripte, Bilder oder sonstigen Inhalte von fremden Servern. Alle Dateien kommen von tldcost selbst.

Ein automatischer Test im Repository prüft bei jeder Änderung, dass die Seite keine Cookies setzt, nichts im Browser speichert und keine Anfragen an fremde Server stellt.

## 5. Links zu Anbietern

Die Tabelle verlinkt die Preisseiten der Anbieter direkt und ohne Tracking-Parameter. Erst wenn Sie einem Link folgen, ruft Ihr Browser die Seite des Anbieters auf. Dort gilt dessen Datenschutzerklärung.

## 6. Öffentliche Daten-Schnittstelle (API)

Die Preisdaten stehen auch als statische Dateien unter `/api/v1/` bereit. Die Schnittstelle braucht kein Login und keinen Schlüssel und enthält keine personenbezogenen Daten. Für Abrufe gilt dasselbe wie für die Website (Abschnitt 2).

## 7. Fehler melden

Das Repository chnet/tldcost ist seit dem 19.11.2026 öffentlich. Der Link „Fehler melden“ führt zu einem Formular bei GitHub; ohne GitHub-Konto erreichen Sie uns per E-Mail, dafür gilt Abschnitt 8. Bei GitHub nehmen wir Korrekturen und Hinweise als Issues und Pull Requests entgegen. Für GitHub gilt:

- Der Link überträgt nur Angaben zur Tabellenzeile (Anbieter, TLD) an das Formular bei GitHub, keine Daten über Sie.
- Für einen Beitrag brauchen Sie ein Konto bei GitHub (GitHub, Inc., USA). Bei GitHub gilt die [Datenschutzerklärung von GitHub](https://docs.github.com/de/site-policy/privacy-policies/github-general-privacy-statement).
- Issues und Pull Requests sind **öffentlich** und zeigen Ihren GitHub-Namen. Bitte geben Sie dort keine persönlichen Daten an, die nicht öffentlich sein sollen.
- Wir verarbeiten Ihre Angaben, um den Hinweis zu prüfen und die Daten zu korrigieren. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Unser berechtigtes Interesse sind korrekte und nachvollziehbare Daten.
- Beiträge bleiben Teil der öffentlichen Historie des Projekts.

## 8. Kontakt per E-Mail

Schreiben Sie uns eine E-Mail, verarbeiten wir Ihre Adresse und Ihre Nachricht, um die Anfrage zu beantworten. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO, bei Anfragen zu einem Vertrag Art. 6 Abs. 1 lit. b DSGVO. Wir löschen die Daten, wenn die Anfrage erledigt ist und keine gesetzlichen Aufbewahrungspflichten bestehen.

E-Mails an unsere Adressen (hello@, privacy@) werden über Microsoft Exchange Online (Microsoft Ireland Operations Ltd.) verarbeitet. Es gilt der Auftragsverarbeitungsvertrag mit Microsoft.

## 9. Ihre Rechte

Sie haben das Recht auf

- Auskunft (Art. 15 DSGVO),
- Berichtigung (Art. 16 DSGVO),
- Löschung (Art. 17 DSGVO),
- Einschränkung der Verarbeitung (Art. 18 DSGVO),
- Datenübertragbarkeit (Art. 20 DSGVO),
- Widerspruch gegen Verarbeitungen auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO (Art. 21 DSGVO).

Anfragen richten Sie bitte an [privacy@chnet.solutions](mailto:privacy@chnet.solutions).

## 10. Beschwerderecht

Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren (Art. 77 DSGVO). Zuständig für uns ist der Thüringer Landesbeauftragte für den Datenschutz und die Informationsfreiheit (TLfDI), da die Verantwortliche ihren Sitz in Breitenworbis (Thüringen) hat.

## 11. Änderungen

Wir passen diese Datenschutzerklärung an, wenn sich die Technik von tldcost oder die Rechtslage ändert.

Stand: 19. November 2026
