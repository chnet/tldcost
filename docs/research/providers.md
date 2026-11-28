# Provider research: contract terms, billing, features

**Phase:** 1 (research) · **Collected:** 2026-11-12 · **Status:** working basis for `data/providers/*.json` (phase 2, after the data schema is merged)

For the 17 providers listed in `docs/concepts/tldcost.md` § 3.5, this document collects the contract data that can be verified from public sources: minimum term, notice period, billing cycle, auto-renew, price change clause, transfer-out, payment methods and the feature matrix. It is **not a price list**. The prices below are only examples for orientation; the seed prices are in `data/offers/`.

## Method

- Public pages only (price lists, AGB (terms and conditions), service descriptions, help centers, Impressum (legal notice)). No login, no checkout, no bypassing of bot protection.
- The `robots.txt` was checked before every request. Disallowed paths were not fetched and are marked as `ROBOTS-DISALLOWED` or "blocked".
- At most 1 request per second per host, generic user agent `tldcost-research/0.1 (+https://github.com/chnet/tldcost)`.
- Every value has a source (URL) and a retrieval date. Contract values also have the location (clause) and a short verbatim quote.
- Not found means `unbekannt` (unknown), with a note on what was checked. Nothing was estimated or carried over from other providers.
- If a provider's pages contradict each other (e.g. FAQ vs. AGB), both values are recorded. For `data/providers` the AGB value applies; the conflict goes into the footnote.
- Personal names (managing directors, owners) were deliberately not included; the operator is given by company name and registered office.

## Overview

Short summary of the contract values. Details, quotes and sources are in each provider's section. ⚠ = contradictory statements from the provider, ? = unknown.

| Provider | Price display | Minimum term | Notice period | Billing | Auto-renew | Price change announced | Transfer-out |
|---|---|---|---|---|---|---|---|
| [ALL-INKL.COM](#all-inklcom-all-inkl) | gross | none (prepayment 1–12 mo.) | 7 days | selectable 1/3/6/12 mo. ⚠ | yes | yes, 6 weeks + special termination right | fee not stated |
| [Alfahosting](#alfahosting-alfahosting) | gross, monthly price | 12 mo. | ? (AGB blocked by robots) | ? | ? | ? | ? |
| [checkdomain](#checkdomain-checkdomain) | gross, monthly price | 12 mo. | 4 weeks ⚠ (price list: 14 days) | yearly | yes | yes, 6 weeks, deemed consent | 0 € |
| [Contabo](#contabo-contabo) | ? | 12 mo. (TLD-dependent 24) | 3 months | 12/24 mo. in advance | yes | yes, with special termination right | auth code in portal/API |
| [DomainFactory](#domainfactory-domainfactory) | gross, monthly price | 12 mo. | 1 month ⚠ (§ 17: 4 weeks) | yearly | yes | ? (no clause) | fee ? |
| [Hetzner](#hetzner-hetzner) | gross | 12 mo. (in practice) | 30 days to end of month | yearly | yes | yes, no notice period/special termination right | auth code in Robot |
| [Host Europe](#host-europe-host-europe) | gross, monthly price | 1 or 12 mo. | 6 weeks (.de/.com and others), otherwise 3 months | monthly/yearly | yes | ? (no clause) | release in KIS |
| [INWX](#inwx-inwx) | gross (switchable) | 12 mo. ⚠ (.de page: 1 mo.) | ⚠ 1 day / 1 month / 4 weeks | yearly from account balance | yes, if balance available | yes, 2 months, right to object | 0 € (self-service) |
| [IONOS](#ionos-ionos) | gross, monthly price | 12 mo. (some 24) | 72 h per help page ⚠ (AGB blocked by robots) | ? | yes, 1 year | ? | 0 € |
| [netcup](#netcup-netcup) | gross, monthly price | 12 mo. | 1 month to end of month ⚠ (help center: 31 days) | yearly | yes | yes, 6 weeks + special termination right | fee not stated |
| [one.com](#onecom-one-com) | gross | 12 mo. | 30 days | yearly | yes | yes, 45 days | ? |
| [Strato](#strato-strato) | gross, monthly price | 1 or 12 mo. | 1 month | monthly/yearly | yes ⚠ | yes, 4 weeks + special termination right | AuthInfo only after termination |
| [united-domains](#united-domains-united-domains) | gross | 12 mo. | 1 month ⚠ (FAQ: 14 days / 2 months) | yearly | yes | yes, 4 weeks + special termination right | 0 € |
| [Cloudflare Registrar](#cloudflare-registrar-cloudflare) | net, USD | 12 mo. | – (turn off auto-renew ≥ 30 days before) | yearly | yes | no | fee not stated, 60-day lock |
| [Dynadot](#dynadot-dynadot) | USD, VAT ? | 12 mo. | – (not specified) | yearly | no (opt-in) | no | fee not stated |
| [Porkbun](#porkbun-porkbun) | USD, VAT ? | 12 mo. | 30 days ⚠ (auto-renew can be turned off in the account) | yearly | yes | no | fee not stated, 60-day lock |
| [Amazon Route 53](#amazon-route-53-aws-route53) | net, USD | 12 mo. | – (turn off auto-renew; renewal ~35 days before expiry) | yearly | yes | no | fee not stated |
| [chnet.domains](#chnetdomains-chnet-domains) (operator) | gross | 12 mo. (.gr/.nu/.tk 24) | 7 days (.de/.com) | yearly per domain | yes | yes, 42 days + special termination right | 0 € |

## Cross-cutting findings

- **Monthly prices:** IONOS, Strato, netcup, checkdomain, DomainFactory, Host Europe, Alfahosting and Contabo show domain prices per month, but most bill 12 months in advance. The TCO library must model monthly price × billing period correctly.
- **Promotional prices in year 1:** IONOS, Strato, DomainFactory, checkdomain, one.com and united-domains have much lower prices in the first year. `year1` and `renewal` must be collected separately.
- **Notice periods are often contradictory** (netcup, checkdomain, DomainFactory, INWX, united-domains, IONOS). The AGB are the authoritative source; the conflict must be visible in the table footnote.
- **Tied to hosting:** Contabo sells domains only to customers with another active Contabo contract. Alfahosting apparently sells domains only as an add-on domain to a hosting plan.
- **Cloudflare** does not offer .de and .eu (not in the TLD list of the Registrar API).
- **US providers (Cloudflare, Porkbun, Dynadot):** prices in USD; no public page states how German consumer VAT is handled. For the gross display, the TCO library needs a rule (e.g. `vat_included: false`, `confidence: low`).
- **Corporate groups:** DomainFactory and Host Europe have the same management and nearly identical AGB. checkdomain and Alfahosting have the same VAT ID (dogado). united-domains belongs to IONOS Group. This may be relevant for presenting neutrality.
- **Whois privacy for .de is `n/a` for every provider:** this is registry-based, not a provider feature. DENIC does not publish data of natural persons: „Wir veröffentlichen nur Daten von juristischen Personen (ORG-Handles). Angaben zu natürlichen Personen sind aus Datenschutzgründen nicht öffentlich einsehbar.“ ([DENIC Whois-Service](https://www.denic.de/services/whois-service/), retrieved 2026-11-15). All .de offers therefore have `whois_privacy: "n/a"` (methodik: „Die Registry zeigt die Inhaberdaten ohnehin nicht öffentlich“).
  - .eu is not set uniformly: EURid shows the e-mail address and language of individuals („Information displayed for individuals holding a domain name is limited to: Email address, Language“, [EURid GDPR](https://eurid.eu/en/gdpr/), retrieved 2026-11-15). The .eu values stay per provider.
  - Requests (2026-11-15, 11:03:57Z–11:04:41Z, `tldcost-bot`, 5 s apart): `www.denic.de/robots.txt` (404, no rules), `/services/whois-service/`; `eurid.eu/robots.txt` (allows all except `/safe-online/`), `/sitemap.xml` (to find the page), `/en/gdpr/`.
- **Conflict of interest:** chnet.domains is the portal operator's own offering and, according to its own AGB (§ 2 Abs. 4), a reseller of ALL-INKL.COM. Both were collected here under the same rules.

## Open items (selection)

| Provider | Item | Proposal |
|---|---|---|
| Alfahosting | AGB and withdrawal page blocked by robots.txt, help center 403 | Read the AGB manually or ask the provider; until then contract fields `unbekannt` |
| IONOS | AGB (`/terms-…`) blocked by robots.txt; notice period only from help page (72 h), unconfirmed reference to AGB § 5.3 (1 month) | Check manually, until then `confidence: low` |
| Hetzner | two channels (Robot vs. konsoleH) with different prices; konsoleH price page redirects in a loop (bot check) | Owner decision on which channel counts as "Hetzner" |
| Host Europe | price page, home page and Impressum only via JavaScript; prices from FAQ table (as of 10/2024) | The scraper needs a different access path; values as `confidence: medium` |
| INWX, netcup | standard prices are loaded via JavaScript | Scraper: look for product pages per TLD or a JSON endpoint |
| Contabo | tax and currency of domain prices not shown | Clarify manually |
| chnet.domains | on 2026-11-12 the website showed „Vorschau – noch nicht öffentlich“, ordering not possible. On 2026-11-25 the [price list](https://chnet.domains/preise/) no longer shows this note; its maintenance notice („Wartungsarbeiten.“) is in the static HTML only as a hidden element. Ordering itself was not tested. | Listed as an ordinary row (decision Q2, `docs/decisions.md`); prices from the adapter `chnet-domains` |
| all | `reviewed_at` + 90-day review (concept § 4 Finding 8) | Use the date 2026-11-12 as the first `reviewed_at` |

---

# Providers in detail

## ALL-INKL.COM (`all-inkl`)

- Operator: ALL-INKL.COM - Neue Medien Münnich (sole proprietorship), Friedersdorf, Germany; VAT ID DE 212657916 ([Impressum](https://all-inkl.com/impressum), retrieved 2026-11-12)
- Price list: https://all-inkl.com/domains/preise
- AGB: https://all-inkl.com/agb (as of: 25.08.2026). There is no separate service description for domains. The domain rules are in AGB section 2.4 („Domain-Service“). In addition, there are TLD-specific domain terms that are only shown during ordering (AGB 2.4.4.3).
- Price display: gross. Domain price list: „* Die Preise enthalten die gesetzliche Mehrwertsteuer in Höhe von 19%.“ Likewise AGB 8.1.
- Notes:
  - Domains are available without web hosting as a separate „Domaintarif“ („Sie haben jederzeit die Möglichkeit, Ihren Domaintarif zu einem Webhostingtarif … zu erweitern“, [Domains](https://all-inkl.com/domains)). A hosting package is therefore **not** required.
  - However, the AGB consistently refer to „Webhosting-Paket/-Tarif“. According to AGB 2.4.1.2, the domain service runs „in einem einheitlichen Vertragsverhältnis mit dem jeweils durch den Kunden bestellten Webhosting-Tarifpaket“. The AGB do not say explicitly whether the term and payment rules (sections 8, 14) apply in the same way to the domain-only plan. This is assumed here, because no other rule is published.
  - Reseller: according to AGB 2.4.2, NMM offers registration „als Vertriebspartner („Reseller“) eines zugelassenen Registrars“. The registrar is not named.
  - Billing conflict: the price list states a „Jahresgebühr“ or prices „pro Jahr“. However, according to AGB 8.2.1/14.2 and the [payment method page](https://all-inkl.com/webhosting/zahlungsweise), the customer chooses a prepayment period of 1, 3, 6 or 12 months („Jeder unserer Tarife ist dabei monatlich zahlbar“).
  - Some TLDs (e.g. .gr, .lv) are billed „mit der Bestellung immer für 2 Jahre im Voraus“ (footnote ** of the price list).
  - The price list has two columns: setup and yearly fee. For .de and .com the setup is 0,00 €, for many ccTLDs 9,90 € or more.
  - Project note: according to concept § 2, chnet.domains is itself an All-Inkl reseller. This is a conflict of interest; please check the values with particular neutrality.
- Orientation (not seed): .de 0,00 € setup, 9,90 €/year; .com 0,00 € setup, 14,90 €/year. All gross, [price list](https://all-inkl.com/domains/preise), retrieved 2026-11-12. The list does not state a separate renewal price; it only shows the „Jahresgebühr“.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | ALL-INKL.COM - Neue Medien Münnich (sole proprietorship), Friedersdorf, DE | Impressum: „ALL-INKL.COM - Neue Medien Münnich … D-02742 Friedersdorf“ (shortened) | [Impressum](https://all-inkl.com/impressum) | 2026-11-12 |
| price_page | https://all-inkl.com/domains/preise | Columns „Einrichtung“ / „Jahresgebühr“ | [Price list](https://all-inkl.com/domains/preise) | 2026-11-12 |
| terms | https://all-inkl.com/agb, as of 25.08.2026 | AGB header: „(Stand: 25.08.2026)“ | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| vat_display | gross (incl. 19 % VAT) | Price list footnote *: „Die Preise enthalten die gesetzliche Mehrwertsteuer in Höhe von 19%.“; AGB 8.1: „Preise einschließlich der deutschen Umsatzsteuer“ | [Price list](https://all-inkl.com/domains/preise), [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| min_term_months | no minimum term; term = selected prepayment period (min. 1 month) | AGB 14.1: „Es ist keine Mindestvertragslaufzeit vereinbart“; AGB 14.2: „Angabe eines Vorauszahlungszeitraums (1 Monat, 3, 6, 12 Monate)“ | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| notice_period_days | 7 | AGB 14.5.8: „muss er die Kündigung spätestens 7 Kalendertage vor Ablauf des Vorauszahlungszeitraumes erklären“. FAQ matches: „empfehlen, die Kündigung spätestens 1 Woche vor Ablauf … durchzuführen“ | [AGB](https://all-inkl.com/agb), [FAQ](https://all-inkl.com/wichtig/faq) | 2026-11-12 |
| billing_cycle | prepayment selectable: monthly / 3 / 6 / 12 months (but the price list shows yearly prices; .gr/.lv: 2 years in advance) | AGB 8.2.1: „bestimmt der Kunde mit seiner Bestellung einen Vorauszahlungszeitraum (1 Monat, 3, 6, 12 Monate)“; price list **: „erfolgt mit der Bestellung immer für 2 Jahre im Voraus“ | [AGB](https://all-inkl.com/agb), [Price list](https://all-inkl.com/domains/preise) | 2026-11-12 |
| auto_renew_default | yes | AGB 14.4: „ohne dass der Kunde den Vertrag gekündigt hat, so beginnt … der von ihm gewählte Vorauszahlungszeitraum … erneut“ | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| price_change_notice | yes: 6 weeks in advance in text form, special termination right on increase (not on VAT change) | AGB 8.6.5: „mindestens sechs Wochen vor ihrem geplanten Wirksamwerden in Textform mitgeteilt … das Recht zu, den Vertrag ohne Einhaltung einer Kündigungsfrist … zu kündigen“; AGB 8.6.6 (VAT) | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| setup_fee | .de/.com 0,00 €; other TLDs partly 9,90 € or 19,90 € | Price list column „Einrichtung“ | [Price list](https://all-inkl.com/domains/preise) | 2026-11-12 |
| transfer_out | Auth code after requesting the provider change, by e-mail within 2 business days. No fee is stated. | AGB 14.5.11: „erhält der Kunde einen Code („Auth-Code“) zugesandt oder über sein gesichertes Benutzerkonto (MembersArea) übermittelt“; FAQ: „innerhalb von 2 Werktagen an die … Kontakt-E-Mail-Adresse versendet“ | [AGB](https://all-inkl.com/agb), [FAQ](https://all-inkl.com/wichtig/faq) | 2026-11-12 |
| payment_methods | sepa (default); bank transfer against advance invoice without a SEPA account. No PayPal/card stated. | Zahlungsweise: „ausschließlich das SEPA-Lastschriftverfahren“ … „Rechnungslegung erfolgt im Voraus und Sie überweisen einfach den Rechnungsbetrag“; AGB 8.2.3 | [Zahlungsweise](https://all-inkl.com/webhosting/zahlungsweise), [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| ssl_free | unknown for the domain-only plan. Let's Encrypt is „in vielen Tarifen kostenlos“, otherwise an add-on option at extra cost | FAQ: „Die Option steht in vielen Tarifen kostenlos zur Verfügung, andernfalls kann diese als Zusatzoption … bestellt werden“ | [FAQ](https://all-inkl.com/wichtig/faq) | 2026-11-12 |
| forward_301 / forward_302 | domain forwarding yes (in the domain-only plan). Status code (301/302) not stated → unknown | Vorteile, Funktionen: „Domain-Weiterleitung“, „Weiterleitung auf IP-Adresse möglich“ | [Vorteile](https://all-inkl.com/domains/vorteile) | 2026-11-12 |
| dns_editor | yes | Vorteile, Funktionen: „Tool zur DNS-Verwaltung“ | [Vorteile](https://all-inkl.com/domains/vorteile) | 2026-11-12 |
| custom_ns | unknown (only AGB 2.4.12.2 a: „Falls der Kunde eigene Nameserver stellt …“; suggests it is possible, the product page does not mention it) | AGB 2.4.12.2 a | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| dnssec | unknown | not mentioned on Domains, Vorteile, FAQ, AGB | – | 2026-11-12 |
| email_forwarding | yes (in the domain-only plan) | Vorteile, Funktionen: „E-Mail-Weiterleitung“ | [Vorteile](https://all-inkl.com/domains/vorteile) | 2026-11-12 |
| whois_privacy | unknown (AGB 2.4.8 only refers to the registry's WHOIS/RDAP) | AGB 2.4.8: „NMM hat keinen Einfluss darauf, welche Daten … angezeigt … werden“ | [AGB](https://all-inkl.com/agb) | 2026-11-12 |
| api | yes: KAS API (SOAP) with domain and DNS functions. It is not stated whether it is available in the domain-only plan. | API reference: „get_domains() … add_domain() … update_domain()“ | [KAS API Reference](https://kasapi.kasserver.com/dokumentation/reference) | 2026-11-12 |
| two_factor | yes (TOTP app for MembersArea, KAS, WebMail) | FAQ: „Die Zwei-Faktor-Authentifizierung (2FA) bieten wir … für den Login in Members Area, KAS … und WebMail an“; AGB 4.3.2 | [FAQ](https://all-inkl.com/wichtig/faq), [AGB](https://all-inkl.com/agb) | 2026-11-12 |

Open items:
- Do AGB sections 8/14 (prepayment from 1 month) really apply to the domain-only plan? The price list only mentions „Jahresgebühr“. Clarify via a support request or the order summary (not accessible without starting an order).
- The TLD-specific domain terms (AGB 2.4.4.3) are only shown during ordering. Not checked (no checkout).
- DNSSEC, Whois privacy, 301/302 status code, custom name servers and Let's Encrypt in the domain-only plan are not publicly documented.
- Checked: /impressum, /domains, /domains/preise, /domains/vorteile, /domains/domain-umzug, /domains/kuendigung, /agb, /wichtig/faq, /webhosting/zahlungsweise, /webhosting/paketvergleich, guide „Domain schließen oder zu anderem Provider wechseln“, kasapi.kasserver.com/dokumentation/reference. No robots blocks.

Price data (Archiv-Issue 75, 2026-11-15):
- **Automated access:** [robots.txt](https://all-inkl.com/robots.txt) allows `/domains*` (blocked are e.g. `/members`, `/ajax`, `/*step=`). The [AGB](https://all-inkl.com/agb) (as of 25.08.2026) contain no clause on automated access. Both checked 2026-11-15.
- **Source:** the price list https://all-inkl.com/domains/preise, scraped (adapter `all-inkl`). One static HTML table with the columns „Einrichtung“ and „Jahresgebühr“, gross („* Die Preise enthalten die gesetzliche Mehrwertsteuer in Höhe von 19%.“).
- **Owner rule „orderable without another contract“:** ALL-INKL sells a domain-only „Domain-Tarif“ only for the rows marked as domain plans (tab „Domain-Tarife“, 23 TLDs on 2026-11-15, e.g. also .fr, .nl, .us). Of the MVP TLDs, only these 9 are domain plans: .de, .at, .com, .net, .org, .info, .biz, .eu, .ch. They get offers. All other TLDs of the list are add-on domains: „Die Zusatzdomains lassen sich beliebig zu jedem unserer Webhosting- oder Server-Tarife hinzubuchen“ ([Zusatzdomains](https://all-inkl.com/webhosting/domains)). They need a hosting or server plan and **get no offer**. Of the MVP TLDs this concerns .io, .dev, .app, .shop, .me, .co, .online, .berlin, .xyz and .cloud. .ai is not in the list at all.
- **Plan fee and included domains:** a Domain-Tarif is its own contract for one domain: „Nachdem Sie sich für einen Tarif entschieden haben, geben Sie zuerst Ihre Wunschdomain an“ and „Bitte beachten Sie, dass Sie mit der Bestellung eines Domain-Tarifs einen neuen Vertrag mit einem separaten Account erhalten“ ([Bestellung](https://all-inkl.com/domains/bestellungen), retrieved 2026-11-15). No base or monthly fee besides the price list is published: /domains states „Domaintarife: Preis pro Jahr in Euro“, and the list shows per TLD only „Einrichtung“ (one-time) and „Jahresgebühr“. These two columns are therefore the full plan fee and go into `setup` and `year1`/`renewal`. One domain per plan, no further domains included.
- **Mapping:** the single yearly fee is used as year1 and renewal (no separate renewal price stated), hence `confidence: medium`. Rows marked „**“ (billed two years in advance) would be skipped; none of them is a domain-plan row. `promo: null`: the [.de page](https://all-inkl.com/domains/de-tld) says „Jetzt starten & Gratismonat sichern“ (retrieved 2026-11-15; not on /domains), but neither the price list nor the order page states the free month for the Domain-Tarif, so it is not modelled.
- **Not resolved:** the prepayment periods of 1/3/6/12 months (AGB 8.2.1) versus the yearly price list (see the open items above). The order summary was not opened (no checkout).
- **Conflict of interest:** chnet.domains is an ALL-INKL reseller (see above). The adapter applies the same rules as for every other provider; the values come unchanged from the public price list.

## Alfahosting (`alfahosting`)

- Operator: Alfahosting GmbH, Edmund-von-Lippmann-Straße 13-15, 06112 Halle (Saale), Germany. HRB 214733 (Amtsgericht Stendal), VAT ID DE249338561. ([Impressum](https://alfahosting.de/impressum/), retrieved 2026-11-12)
  - Note: checkdomain GmbH lists the same VAT ID and the same managing directors. This suggests the same corporate group (dogado) or a VAT group (Organschaft). Relevant for presenting neutrality.
- Price list: https://alfahosting.de/webhosting-upgrades-domainpreise/ („Domainpreise und Upgrades“, standard prices and reseller price tiers). Short overview at https://alfahosting.de/domain-hosting/
- AGB: https://alfahosting.de/agb-alfahosting/ → **ROBOTS-DISALLOWED**, not fetched. Version and date: unknown. The withdrawal notice (/widerrufsbelehrung/) is also blocked by robots.txt.
- Price display: gross, monthly prices. Footnote: „Alle Preise inklusive gesetzlicher MwSt. – Preise monatlich.“ ([Domains](https://alfahosting.de/domain-hosting/), [Price list](https://alfahosting.de/webhosting-upgrades-domainpreise/))
- Notes:
  - **Domains are sold as add-on domains to a plan.** Price list: „Alle zu unseren Standardpreisen aufgeführten Domainendungen können jederzeit zu Ihrem Tarif hinzugebucht werden. Die Mindestvertragslaufzeit für Zusatzdomains beträgt 12 Monate. Die Bestellung nehmen Sie bitte im Kundencenter vor.“
  - No publicly documented way to order a domain without a hosting plan was found. The „Domains“ page only shows prices and a domain check; the shopping cart is part of the web hosting order process.
  - Web hosting plans include „mindestens eine kostenlose Domain für 12 Monate“ ([Webhosting](https://alfahosting.de/webhosting/)).
  - **The price is shown per month** (e.g. „.de 1,39 Euro/mtl.“). Billing cycle for domains unknown (AGB blocked). The general footnote reads: „Mindestlaufzeit von 12 Monaten … bzw. bei Zahlung via Lastschrift wahlweise 1 Monat … Bei einer Vertragslaufzeit von 1 Monat fallen einmalig 9,99 Euro Setupgebühr an.“ Whether this applies to add-on domains is unclear: the price list states a fixed 12-month minimum term for add-on domains.
  - The price list also contains cheaper reseller price tiers: „gelten nur unter Verwendung des Domain-Robots“, tied to Reseller Plan A to Profi. Not relevant for end customers.
  - Fee „Domainaustausch / Neuregistrierung (innerhalb des laufenden Vertragsjahres) 9,00 Euro einmalig zzgl. Domainkosten“ (price list, Services section).
- **Price source (Archiv-Issue 75, checked 2026-11-15):** no scraper adapter.
  - [robots.txt](https://alfahosting.de/robots.txt) (retrieved 2026-11-15) allows the price list but disallows `/agb-alfahosting/` and `/widerrufsbelehrung/`. The AGB cannot be checked for rules on automated access, so automated access counts as not confirmed (Archiv-Issue 75 rule): manual entry only.
  - The [price list](https://alfahosting.de/webhosting-upgrades-domainpreise/) (one manual fetch, 2026-11-15T04:33:31Z) still reads: „Alle zu unseren Standardpreisen aufgeführten Domainendungen können jederzeit zu Ihrem Tarif hinzugebucht werden. Die Mindestvertragslaufzeit für Zusatzdomains beträgt 12 Monate. Die Bestellung nehmen Sie bitte im Kundencenter vor.“ Domains are add-ons to a hosting plan; there is no domain-only order.
  - Standard prices, gross per month („Euro/mtl.“, „Alle Preise inklusive gesetzlicher MwSt.“): .de 1,39 · .com 2,19 · .net 2,19 · .org 2,29 · .eu 1,99 · .io 9,19 · .dev 2,99 · .app 2,99 · .shop 4,99 · .info 2,99 · .at 2,19 · .ch 2,49 · .me 2,39 · .co 3,99 · .online 4,79 · .berlin 6,39 · .xyz 1,99 · .biz 2,49 · .cloud 2,89 · .ai 24,09. No separate renewal or transfer price.
  - **No offers (owner decision 2026-11-15, option A):** domains can only be booked as add-on domains to a hosting plan (our summary of the quote above). The table compares the cost of a domain on its own, and these prices only apply together with a hosting plan whose cost the totals would not show. Source: [price list](https://alfahosting.de/webhosting-upgrades-domainpreise/), quote above, retrieved 2026-11-15. This is the criterion „bei denen Domains ohne weiteren Vertrag (z. B. Hosting) bestellbar sind“ in [Methodik, Anbieterauswahl](../pages/methodik.md#anbieterauswahl) (Archiv-Issue 87).
- Orientation (not seed, gross, standard prices, [price list](https://alfahosting.de/webhosting-upgrades-domainpreise/), retrieved 2026-11-12):
  - .de: 1,39 €/month (= 16,68 €/year)
  - .com: 2,19 €/month (= 26,28 €/year)
  - A separate renewal price is not stated.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Alfahosting GmbH, Halle (Saale), DE | Impressum: „Edmund-von-Lippmann-Straße 13-15 06112 Halle (Saale) … HRB: 214733 Amtsgericht Stendal“ | [Impressum](https://alfahosting.de/impressum/) | 2026-11-12 |
| price_page | https://alfahosting.de/webhosting-upgrades-domainpreise/ | Heading „Domainpreise und Upgrades“, column „Standardpreise“ | [Price list](https://alfahosting.de/webhosting-upgrades-domainpreise/) | 2026-11-12 |
| terms | https://alfahosting.de/agb-alfahosting/ — ROBOTS-DISALLOWED, version unknown | robots.txt: „Disallow: /agb-alfahosting/“ | [robots.txt](https://alfahosting.de/robots.txt) | 2026-11-12 |
| vat_display | gross (incl. statutory VAT), monthly prices | Price list: „Alle Preise inklusive gesetzlicher MwSt.“; Domains footnote: „Preise monatlich.“ | [Price list](https://alfahosting.de/webhosting-upgrades-domainpreise/), [Domains](https://alfahosting.de/domain-hosting/) | 2026-11-12 |
| min_term_months | 12 (add-on domain) | Price list: „Die Mindestvertragslaufzeit für Zusatzdomains beträgt 12 Monate.“ (website, not AGB) | [Price list](https://alfahosting.de/webhosting-upgrades-domainpreise/) | 2026-11-12 |
| notice_period_days | unknown | AGB blocked. Not stated on the price list, Domains, Zahlungsmethoden or Domain Protection pages. Termination is done via a ticket form (hilfe.alfahosting.de). | – | 2026-11-12 |
| billing_cycle | unknown (displayed monthly; cycle for domains not documented) | Footnote: „Mindestlaufzeit von 12 Monaten … bzw. bei Zahlung via Lastschrift wahlweise 1 Monat“ (general, not domain-specific) | [Domains](https://alfahosting.de/domain-hosting/) | 2026-11-12 |
| auto_renew_default | unknown | AGB blocked | – | 2026-11-12 |
| price_change_notice | unknown | AGB blocked | – | 2026-11-12 |
| setup_fee | None stated for domains. Generally 9,99 € one-time for a 1-month term (unclear whether it applies to domains). | Footnote: „Bei einer Vertragslaufzeit von 1 Monat fallen einmalig 9,99 Euro Setupgebühr an.“ | [Domains](https://alfahosting.de/domain-hosting/), [Zahlungsmethoden](https://alfahosting.de/zahlungsmethoden/) | 2026-11-12 |
| transfer_out | Fee unknown. With Domain Protection, the AuthCode is only visible after 2FA. | Domain Protection: „AuthCode nur nach erfolgreicher 2FA-Freigabe sichtbar (Transferschutz).“ | [Domain Protection](https://alfahosting.de/domain-protection/) | 2026-11-12 |
| payment_methods | sepa (direct debit), prepayment/bank transfer, paypal | Zahlungsmethoden: „Bezahlung per Bankeinzug“, „Vorkasse … Rechnungsbetrag … an uns überweisen“, „PayPal“ | [Zahlungsmethoden](https://alfahosting.de/zahlungsmethoden/) | 2026-11-12 |
| ssl_free | yes, Let's Encrypt in all plans (domain only usable with a plan) | Webhosting: „In allen unseren Tarifen ist Let's Encrypt kostenlos inklusive!“ | [Webhosting](https://alfahosting.de/webhosting/) | 2026-11-12 |
| forward_301 / forward_302 | forwarding yes („herkömmliche Domainweiterleitung“), status code unknown | Domains: „Ändern Sie DNS-Einträge ganz leicht im Kundencenter oder richten Sie eine herkömmliche Domainweiterleitung ein.“ | [Domains](https://alfahosting.de/domain-hosting/) | 2026-11-12 |
| dns_editor | yes | Domains: „Inkl. DNS-Verwaltung und Weiterleitungen“ | [Domains](https://alfahosting.de/domain-hosting/) | 2026-11-12 |
| custom_ns | unknown | not mentioned | – | 2026-11-12 |
| dnssec | unknown | not mentioned | – | 2026-11-12 |
| email_forwarding | unknown for the domain alone (e-mail is part of the web hosting plans) | – | [Webhosting](https://alfahosting.de/webhosting/) | 2026-11-12 |
| whois_privacy | unknown | not mentioned | – | 2026-11-12 |
| api | unknown (a „Domain-Robot“ is mentioned for resellers) | Price list: „Die vergünstigten Domainpreise gelten nur unter Verwendung des Domain-Robots.“ | [Price list](https://alfahosting.de/webhosting-upgrades-domainpreise/) | 2026-11-12 |
| two_factor | 2FA for transfer protection (Domain Protection) documented; price not shown. Unknown for the customer login. | Domain Protection: „Transferschutz (Zwei-Faktor-Authentifizierung)“ | [Domain Protection](https://alfahosting.de/domain-protection/) | 2026-11-12 |

Open items:
- **All contract values from the AGB are missing**: notice period, auto-renew, price change, billing cycle. The AGB URL is blocked by robots.txt; per the research method, no other route was tried. Proposal: have a human check it manually in a browser, or ask the provider.
- **Blocked:** the help center hilfe.alfahosting.de responds with HTTP 403 and a „Just a moment...“ page (bot protection). Not bypassed. Affected pages include: https://hilfe.alfahosting.de/hc/de/articles/29436526777873-Wie-kann-ich-eine-Domain-registrieren
- Checked: /, /impressum/, /domain-hosting/, /webhosting-upgrades-domainpreise/, /domain-check/, /zahlungsmethoden/, /domain-protection/, /webhosting/, /robots.txt. ROBOTS-DISALLOWED: /agb-alfahosting/ (and, per robots.txt, /widerrufsbelehrung/).

## checkdomain (`checkdomain`)

- Operator: checkdomain GmbH, Große Burgstraße 27/29, 23552 Lübeck, Germany. HRB 5100 HL, VAT ID DE249338561. Part of the dogado group. ([Impressum](https://www.checkdomain.de/impressum/), retrieved 2026-11-12)
- Price list: https://www.checkdomain.de/agb/preisliste/ („Preise und Kündigungsfristen“, per TLD: notice period, minimum term/billing period, setup, price/month). There are also TLD pages, e.g. https://www.checkdomain.de/de-domain/ and https://www.checkdomain.de/com-domain/
- AGB: https://www.checkdomain.de/agb/ (HTML without a date). The PDF version https://www.checkdomain.de/agb/pdf/ is marked „Stand: 23.10.2024“. Domain rules are in section B, part I „Sonderregelungen für Domains“.
- Price display: gross, with the note „*Preise sind inkl. 19% MwSt. (Deutschland)“ (price list). AGB A 3.3: „Alle Preise verstehen sich inkl. … Mehrwertsteuer“.
- Notes:
  - **Domain prices are shown as monthly prices** („Preis / Monat“, e.g. .de 1,49 €/month). However, billing is 12 months in advance: „12 Monate, welche im Voraus für diesen Zeitraum berechnet werden“ (TLD pages). For the comparison, multiply by 12.
  - Some TLDs have longer minimum terms or notice periods. Example from the price list: .ai with 24 months and 60 days notice, many ccTLDs with 35 days.
  - Promotion at the time of retrieval: .de and .com cost „im ersten Jahr nur 0,07EUR/Monat“. After that, .de costs 1,49 €/month and .com 2,39 €/month. Only 1 domain per customer.
  - Domains can be ordered without hosting.
  - Registration as an agency service (Geschäftsbesorgung): according to AGB B I 1.1, the registration contract is concluded „direkt zwischen dem Kunden und der jeweiligen Domainvergabestelle bzw. dem jeweiligen Registrar“. The registrar is not named.
  - „Domain Protection“ (transfer protection via 2FA, recovery) is an add-on product for 0,99 €/month per domain, billed yearly.
  - **Notice period conflict:** the price list and TLD pages state „14 Tage“ for .de/.com. AGB B I 3.3 states „vier Wochen“ for all domains. AGB A 10.2 states one month for consumers. Per the research method, the AGB apply (B I 3.3 as the special rule for domains, see A 10.6). However, the price list is newer and more specific. Please check the legal position.
- Orientation (not seed, gross, [price list](https://www.checkdomain.de/agb/preisliste/), retrieved 2026-11-12):
  - .de: 0,00 € setup, 1,49 €/month = 17,88 €/year regular. Promotion: 0,07 €/month in year 1.
  - .com: 0,00 € setup, 2,39 €/month = 28,68 €/year regular. Promotion: 0,07 €/month in year 1.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | checkdomain GmbH, Lübeck, DE | Impressum: „checkdomain GmbH Große Burgstraße 27/29 23552 Lübeck … HRB 5100 HL“ | [Impressum](https://www.checkdomain.de/impressum/) | 2026-11-12 |
| price_page | https://www.checkdomain.de/agb/preisliste/ | Heading „Preise und Kündigungsfristen“ | [Price list](https://www.checkdomain.de/agb/preisliste/) | 2026-11-12 |
| terms | https://www.checkdomain.de/agb/ ; PDF as of 23.10.2024 | End of AGB PDF: „Stand: 23.10.2024“ | [AGB](https://www.checkdomain.de/agb/), [AGB PDF](https://www.checkdomain.de/agb/pdf/) | 2026-11-12 |
| vat_display | gross (incl. 19 % VAT) | Price list: „*Preise sind inkl. 19% MwSt. (Deutschland)“; AGB A 3.3: „Alle Preise verstehen sich inkl. der nach geltendem Recht zu zahlenden Steuern“ | [Price list](https://www.checkdomain.de/agb/preisliste/), [AGB](https://www.checkdomain.de/agb/) | 2026-11-12 |
| min_term_months | 12 (.de, .com; some TLDs 24) | .de page, billing: „Mindestlaufzeit: 12 Monate, welche im Voraus für diesen Zeitraum berechnet werden.“ AGB A 10.1: „Die Laufzeit des Vertrages ergibt sich aus dem Angebot.“ | [.de domain](https://www.checkdomain.de/de-domain/), [AGB](https://www.checkdomain.de/agb/) | 2026-11-12 |
| notice_period_days | **Conflict:** AGB 28 („vier Wochen“) vs. price list/TLD page 14. With AGB precedence: 28 | AGB B I 3.3: „Die Frist zur Erteilung von Domain-Kündigungsaufträgen an den Anbieter beträgt für alle Domains vier Wochen zum Ende der Laufzeit“. .de page: „mind. 14 Tage vor Ablauf des aktuellen Registrierungszeitraums.“ AGB A 10.2 (general, consumers): „Kündigungsfrist einen Monat“ | [AGB](https://www.checkdomain.de/agb/), [.de domain](https://www.checkdomain.de/de-domain/), [Price list](https://www.checkdomain.de/agb/preisliste/) | 2026-11-12 |
| billing_cycle | yearly in advance (12 months); shown as monthly price | .de page: „12 Monate, welche im Voraus für diesen Zeitraum berechnet werden“; AGB A 7.1: „Der Abrechnungszeitraum kann von der vereinbarten Vertragslaufzeit abweichen.“ | [.de domain](https://www.checkdomain.de/de-domain/), [AGB](https://www.checkdomain.de/agb/) | 2026-11-12 |
| auto_renew_default | yes | AGB A 10.2: „Der Vertrag verlängert sich automatisch um die jeweilige Vertragslaufzeit, wenn er nicht innerhalb der … Frist gekündigt wird.“ Domains FAQ: „Nach der Vertragslaufzeit verlängert sich der Vertrag automatisch.“ | [AGB](https://www.checkdomain.de/agb/), [Domains](https://www.checkdomain.de/domains/) | 2026-11-12 |
| price_change_notice | yes: at least 6 weeks before the new term, with right to object (deemed consent). An explicit special termination right is not stated. | AGB A 7.6: „zum Beginn einer neuen Vertragslaufzeit mit einer angemessenen Ankündigungsfrist von mindestens sechs Wochen geändert werden. Widerspricht der Kunde … nicht …, so gilt die Änderung als genehmigt.“ | [AGB](https://www.checkdomain.de/agb/) | 2026-11-12 |
| setup_fee | 0,00 € (.de, .com) | .de page: „Einrichtungs­kosten 0,00 €“; price list column „Einrichtung“ | [.de domain](https://www.checkdomain.de/de-domain/), [Price list](https://www.checkdomain.de/agb/preisliste/) | 2026-11-12 |
| transfer_out | „Gebühr bei Transfer 0,00 €“. Restore costs 25,00 € (.de) or 99,00 € (.com). It is not stated whether „Transfer“ also means transfer-out. With Domain Protection booked, the auth code is only visible after 2FA release. | .de page: „Gebühr bei Transfer 0,00 € … Gebühr bei Restore 25,00 €“; Domain Protection: „Der Auth-Code wird erst sichtbar, wenn du den Transferschutz per Sicherheitscode (2FA) freigibst.“ | [.de domain](https://www.checkdomain.de/de-domain/), [.com domain](https://www.checkdomain.de/com-domain/), [Domain Protection](https://www.checkdomain.de/domains/domain-protection/) | 2026-11-12 |
| payment_methods | sepa, card (Visa/Master/Amex), paypal. Invoice/bank transfer is stated **inconsistently**. | .de page, billing: „Bankeinzug, Kreditkarte (Visa, Master, Amex), Paypal. Bei Firmierungen (GmbH und AG) ist Zahlung durch Überweisung möglich.“ Same page, top: „Zahlen mit: PayPal, Kreditkarte, Lastschrift oder Rechnung“. AGB A 7.1/7.2: direct debit by default, „gegebenenfalls … Kreditkartenzahlung, PayPal oder Überweisung“ | [.de domain](https://www.checkdomain.de/de-domain/), [AGB](https://www.checkdomain.de/agb/) | 2026-11-12 |
| ssl_free | unknown for domain-only. SSL-Lite costs 1,99 €/month. | Price list SSL: „SSL-Lite … 1,99 €*“ | [Price list](https://www.checkdomain.de/agb/preisliste/) | 2026-11-12 |
| forward_301 / forward_302 | forwarding yes, also masked (frame). 301/302 not stated, so unknown. | .de page, services: „Echte URL wird bei der Weiterleitung versteckt.“ | [.de domain](https://www.checkdomain.de/de-domain/) | 2026-11-12 |
| dns_editor | yes | .de page: „Zugriff auf die Nameserver (z.B. A-, NS-, MX-, CNAME-, SPF-Einstellungen möglich)“; Domains FAQ: „alle Domain Name Service Einstellungen vornehmen“ | [.de domain](https://www.checkdomain.de/de-domain/), [Domains](https://www.checkdomain.de/domains/) | 2026-11-12 |
| custom_ns | yes | Help article: „Wie hinterlege ich eigene Nameserver?“ | [Support DNS](https://www.checkdomain.de/support/nameserver-dns/nutzung-einrichtung-dns/) | 2026-11-12 |
| dnssec | unknown | not mentioned on TLD pages, Domains, support DNS pages, AGB | – | 2026-11-12 |
| email_forwarding | yes | .de page, services: „Mailweiterleitung“ | [.de domain](https://www.checkdomain.de/de-domain/) | 2026-11-12 |
| whois_privacy | unknown | not mentioned (Domain Protection does not include Whois protection) | [Domain Protection](https://www.checkdomain.de/domains/domain-protection/) | 2026-11-12 |
| api | unknown (developer docs not publicly reachable) | developer.checkdomain.de/guide/ redirects to the home page. According to a search result, there used to be a token API after activation via contact form; not verified. | [Developer Guide](https://developer.checkdomain.de/guide/) (redirect) | 2026-11-12 |
| two_factor | 2FA only documented for transfer protection (Domain Protection, paid). Unknown for the customer login. | Domain Protection: „Transferschutz (Zwei-Faktor-Authentifizierung) 0,99 €“ | [Domain Protection](https://www.checkdomain.de/domains/domain-protection/) | 2026-11-12 |

Open items:
- Which notice period applies to domains: 14 days (price list) or 4 weeks (AGB B I 3.3)? The HTML AGB have no date; the PDF says as of 23.10.2024.
- Invoice/bank transfer for consumers: the statements on the .de page contradict each other.
- Is „Gebühr bei Transfer“ the transfer-in or the transfer-out fee? This is not explained.
- DNSSEC, Whois privacy, 2FA for the login and the API are not publicly documented.
- Checked: /impressum/, /, /domains/, /de-domain/, /com-domain/, /agb/, /agb/pdf/, /agb/preisliste/, /domains/domain-protection/, /support/nameserver-dns/allgemeine-fragen-dns/, /support/nameserver-dns/nutzung-einrichtung-dns/, /support/login-und-passwort/, developer.checkdomain.de/guide/ (redirect). No robots blocks.

Price data (Archiv-Issue 75, 2026-11-15):
- **Automated access:** [robots.txt](https://www.checkdomain.de/robots.txt) has `User-agent: *` without any `Disallow`. The [AGB](https://www.checkdomain.de/agb/) (PDF as of 23.10.2024) contain no clause on automated access. Both checked 2026-11-15.
- **Source:** adapter `checkdomain`. The page https://www.checkdomain.de/domains/ embeds the domain data as `window.tldList` (per TLD: monthly price, setup, contract period, current promo with its hint text). Every TLD is cross-checked against the [price list](https://www.checkdomain.de/agb/preisliste/) („Preise und Kündigungsfristen“: monthly price, setup, minimum term, VAT note „*Preise sind inkl. 19% MwSt. (Deutschland)“). A mismatch fails the TLD. Both pages are ISO-8859-1. 3 requests per run.
- **Owner rule „orderable without another contract“:** met. Each domain is its own contract with its own minimum term and notice period (price list per TLD). Hosting is optional: „Wenn du eine passende Domain gefunden hast, kannst du diese Domain kaufen und wir werden dann die Domain registrieren … Und natürlich kannst du bei uns auch das Domainhosting buchen!“ ([.de domain](https://www.checkdomain.de/de-domain/), retrieved 2026-11-15). The price list shows no base or account fee, only optional extras (postal invoice 1,00 €, dunning and chargeback fees, admin work 39,00 € per 15 min.).
- **Mapping:** gross, `unit: month` as displayed („Preis / Monat“, billed „12 Monate, welche im Voraus für diesen Zeitraum berechnet werden“). setup from the data (0 for all MVP TLDs). `transfer_in` not collected („Gebühr bei Transfer“ is not explained, see above).
- **Promos:** most MVP TLDs have a first-year promo, e.g. „Die .de-Domain kostet im ersten Jahr nur 0,07EUR/Monat, danach 1,49EUR/Monat. Das Angebot ist limitiert auf 1 Domain pro Kunde.“ The hint becomes `promo.conditions` (no end date, `valid_until: null`), the promo price `year1`, the regular price `year1_regular` and `renewal`. Regulärer Preis = AGB-Preisliste: the price list („Preise und Kündigungsfristen“) is the regular price list per TLD and month, and the promo is a discount on it, so `year1_regular` is stated, not derived. A promo is used only when the hint names the TLD and both of its amounts match the data. With a hint, the price after year 1 is stated, so `confidence: high`; without one, renewal = the list price is inferred (`medium`).
- **Not written (fail closed):** .com: the hint says „danach 2,19EUR/Monat“, but the data, the price list and the .com page say 2,39 €/month. .at: the hint names „.de-Domain“. .ai: minimum term 24 months with a first-year promo inside it; the payment per term is not stated (AGB A 10.2 also renews terms over one year „jeweils nur um ein Jahr“), so skipped.
- **Plausibility:** checkdomain/de renewal 17,88 €/year (1,49 €/month × 12) is 3.39x the median of the other providers. This is the regular price in the price list and on the .de page, so it is correct.
- **Not modelled:** the trustee fees in the data for .eu (4,92) and .berlin (1,43); they are only needed without a local presence. The notice period conflict (14 days vs. four weeks, see above) concerns the provider file, not the offers.

## Contabo (`contabo`)

- Operator: Contabo GmbH, Welfenstraße 22, 81541 München, Germany. AG München HRB 180722, VAT ID DE267602842. ([Impressum](https://contabo.com/de/legal/impressum/), retrieved 2026-11-12)
  - Note: the structured data (JSON-LD) on the same page gives a different address: „Aschauer Straße 32a, 81549 Munich“. The Impressum text and the AGB header (Welfenstraße 22) are authoritative.
- Price list: https://contabo.com/de/domains/ (table „Price / month“ per TLD)
- AGB: https://contabo.com/de/legal/terms-and-conditions/ (as of December 2025). Part 1 contains the general rules, **part 2 the „Domainbedingungen“** (domain terms, on the same page).
- Price display: **unclear**. The domain table only shows numbers (e.g. „0.99“), without currency and without a tax note. The website has a country and currency selector („Land (Nur für Steuerzwecke)“, Germany 19.0 % VAT). When fetched without a selection, the default country was Afghanistan with currency $. The server price page, by contrast, explicitly says „inkl. MwSt.“ ([Pricing](https://contabo.com/de/pricing/)). According to Domainbedingungen § 2 (3), the order summary shows „den Preis/12 oder 24 Monate ohne Steuern“.
- Notes:
  - **Domains are only available to existing customers with an active contract.** Domainbedingungen § 1 (1): „Der Provider bietet einem Kunden, der bereits mindestens einmal eine Leistung des Providers in Anspruch genommen hat und dessen Vertragsverhältnis auch noch aktiv ist, … die Möglichkeit, neue Domains [zu] registrieren“. So without a server, VPS or web space you cannot buy a domain.
  - The price is shown per month. However, the term is 12 or 24 months, and the total price is due immediately (Domainbedingungen § 7, § 8).
  - **Very long notice period: 3 months** before the end of the term (Domainbedingungen § 8 (2)). The general AGB, by contrast, state 4 weeks (part 1 § 5 (1)). For domains, the special rule in part 2 applies.
  - There are two contracts: a „Domainverwaltungsvertrag“ with Contabo and a „Registrierungsvertrag“ directly with the registry or registrar (Domainbedingungen § 1 (2)). The registrar is not named.
  - No right of withdrawal once performance has begun (Domainbedingungen § 9).
- **Price source (Archiv-Issue 75, checked 2026-11-15): no offer.**
  - [robots.txt](https://contabo.com/robots.txt) (retrieved 2026-11-15) allows `/de/domains/`; the table there is static HTML.
  - The table „Extension / Meaning / Category / Price / month“ states only numbers (e.g. `.de` „0.99“, `.com` „1.99“), **without currency and without a VAT statement**. Currency and tax are set per country on the client side (selector „Land (Nur für Steuerzwecke)“, currency „$ U.S. Dollar / € Euro / £ Pound“; without a selection the page defaults to $), so the shown number cannot be assigned to a currency or to gross/net ([Domains](https://contabo.com/de/domains/), retrieved 2026-11-15).
  - Domains are not openly orderable: only for existing customers with an active contract. Domainbedingungen § 1 (1): „Der Provider bietet einem Kunden, der bereits mindestens einmal eine Leistung des Providers in Anspruch genommen hat und dessen Vertragsverhältnis auch noch aktiv ist, … die Möglichkeit, neue Domains [zu] registrieren …“ ([AGB](https://contabo.com/de/legal/terms-and-conditions/), retrieved 2026-11-12).
  - Result: no rows for Contabo, for two independent reasons: currency and VAT are not stated, and a domain needs another active contract, which excludes Contabo under [Methodik, Anbieterauswahl](../pages/methodik.md#anbieterauswahl) („ohne weiteren Vertrag (z. B. Hosting) bestellbar“, Archiv-Issue 87). Re-check if the price list states currency and VAT and domains become orderable on their own.
- Orientation (not seed, currency and tax unclear, see above, [Domains](https://contabo.com/de/domains/), retrieved 2026-11-12):
  - .de: 0.99 per month
  - .com: 1.99 per month
  - The page does not state a separate renewal price.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Contabo GmbH, München, DE | Impressum: „Contabo GmbH Welfenstraße 22 81541 München Deutschland … HRB 180722“ | [Impressum](https://contabo.com/de/legal/impressum/) | 2026-11-12 |
| price_page | https://contabo.com/de/domains/ | Table „Extension / Meaning / Category / Price / month“ | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| terms | AGB incl. part 2 Domainbedingungen, as of December 2025 | AGB header: „Stand Dezember 2025“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| vat_display | unknown (domain table without tax or currency; order summary „ohne Steuern“) | Domainbedingungen § 2 (3): „den Preis/12 oder 24 Monate ohne Steuern“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/), [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| min_term_months | 12 (24 depending on TLD) | Domainbedingungen § 8 (1): „Der Domainverwaltungsvertrag hat, je nach gewählter Top-Level-Domain eine Vertragslaufzeit von 12 oder 24 Monaten.“ AGB part 1 § 5 (1): „bei Bestellung einer Domain … immer 12 Monate“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| notice_period_days | 90 (original: „drei Monate“) | Domainbedingungen § 8 (2): „muss er dies dem Provider spätestens drei Monate vor Ablauf der Vertragslaufzeit … in Textform anzeigen“. **Conflict** with AGB part 1 § 5 (1): „mit einer Frist von vier Wochen“ (general); the domain-specific rule takes precedence | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| billing_cycle | 12 or 24 months in advance (shown as monthly price) | Domainbedingungen § 7 (1): „Im Falle von Domain-Paketen ist der Gesamtpreis sofort zur Zahlung fällig.“; § 2 (3): „Preis/12 oder 24 Monate“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| auto_renew_default | yes | Domainbedingungen § 8 (2): „Unterbleibt diese Anzeige, verlängert sich der Domainverwaltungsvertrag um die ursprüngliche Vertragslaufzeit.“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| price_change_notice | yes: notification with special termination right within a period set by the provider, otherwise deemed consent. No fixed notice period. | AGB part 1 § 4 (9): „steht dem Kunden jedoch ein Sonderkündigungsrecht zu, das der Kunde innerhalb einer angemessenen, im Einzelfall vom Anbieter festgelegten Frist … ausüben muss“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| setup_fee | unknown (domain page states no setup fee) | – | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| transfer_out | Auth code in the customer portal or via API (`getAuthCode`). An initiated transfer-out counts as termination. Fee not stated. | Domainbedingungen § 8 (4): „Wird der Transfer einer Domain zu einem anderen Anbieter ausgelöst, gilt der Domainverwaltungsvertrag als gekündigt.“ API: „Get auth code for a domain“, `confirmDomainTransferOut` | [AGB](https://contabo.com/de/legal/terms-and-conditions/), [API docs](https://api.contabo.com/) | 2026-11-12 |
| payment_methods | bank transfer, card, PayPal, Skrill, SEPA direct debit (not for the first payment of new customers) | AGB part 1 § 4 (2): „durch Banküberweisung, Kreditkarte, PayPal oder Skrill vornehmen. Für Zahlungen innerhalb der Europäischen Union steht … das SEPA-Lastschriftverfahren zur Verfügung.“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| ssl_free | unknown (not mentioned for domains) | – | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| forward_301 / forward_302 | unknown | not mentioned | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| dns_editor | yes, free | Domains: „Domain Handles und DNS Records selbstständig kostenlos zu verwalten … A, AAAA MX, TXT, SRV oder CNAME“ | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| custom_ns | yes | Domainbedingungen § 2 (2): „auszuwählen, ob und falls ja, mit welchem Name Server … die gewünschte Domain verknüpft werden soll“; API field „nameservers“ | [AGB](https://contabo.com/de/legal/terms-and-conditions/), [API docs](https://api.contabo.com/) | 2026-11-12 |
| dnssec | unknown. Indication: the API's domain object has a field `dnssecKeys`. The product page does not mention DNSSEC. | API example: „"dnssecKeys" : "[\"test-secdns.org. 3600 IN DNSKEY …“ | [API docs](https://api.contabo.com/) | 2026-11-12 |
| email_forwarding | unknown | not mentioned | [Domains](https://contabo.com/de/domains/) | 2026-11-12 |
| whois_privacy | unknown | not mentioned | – | 2026-11-12 |
| api | yes (Contabo API: order and cancel domains, auth code, transfer-out; DNS zones and records) | API docs, group „Domains“: `orderDomain`, `cancelDomain`, `getAuthCode`; group „DNS“: `createDnsZoneRecord` … | [API docs](https://api.contabo.com/) | 2026-11-12 |
| two_factor | yes (MFA via TOTP app for the Customer Panel) | Help: „Multi-factor Authentication (formerly 2-factor authentication or 2FA) adds an extra layer of security to your Customer Panel account.“ | [Help article](https://help.contabo.com/en/support/solutions/articles/103000305452-how-do-i-change-my-2-factor-authentication-settings-) | 2026-11-12 |

Open items:
- Whether the domain prices are gross or net, and in which currency (EUR or USD), cannot be determined without a country selection and the order process. The table is static on the server side, numbers only.
- Setup fee, renewal price, transfer-out fee, SSL, forwarding and Whois privacy are not publicly documented.
- The comparison table should show the existing-customer requirement as a special case "only with another Contabo product".
- Checked: /de/legal/impressum/, /de/domains/ (text and raw HTML), /de/legal/terms-and-conditions/, /de/pricing/, api.contabo.com, help article MFA. /de/imprint/ returned 404. No robots blocks.

## DomainFactory (`domainfactory`)

- Operator: DomainFactory GmbH, c/o WeWork, Neuturmstrasse 5, 80331 München, Germany; Amtsgericht München HRB 150294. The managing directors are the same as at Host Europe ([Impressum](https://www.df.eu/de/impressum/), retrieved 2026-11-12)
- Price list: https://www.df.eu/de/preislisten/ (sections „Domains“ and „Wiederherstellung Domains“). Domain page: https://www.df.eu/de/domains/
- AGB: https://www.df.eu/de/agb/ (as of: 07.05.2026). Domain rules in AGB part 2, § 17 „Besondere Bedingungen für Domains“. A PDF is available at https://www.df.eu/fileadmin/media/doc/DomainFactory_Allgemeine_Geschaeftsbedingungen.pdf (not fetched, HTML evaluated). Registry policies: https://www.df.eu/de/domainpolicies/domainrichtlinien-und-vergabebedingungen/ (redirects to https://www.df.eu/de/richtlinien/).
- Price display: gross („Alle Beträge inklusive gesetzlicher Mehrwertsteuer.“)
- Notes:
  - Domains are sold **individually**. The prices are **monthly prices with a 12-month billing period**: „Die folgenden Preise sind Monatspreise und verstehen sich für einen Abrechnungszeitraum von 12 Monaten.“
  - **Promotion in year 1**: .de and .com „für das gesamte erste Jahr nur 0,99 €“. Only once per customer and only for new registrations. The domain page shows this as „0,08 €*/Monat im 1. Jahr“.
  - AGB § 17(1)(a): the contract is concluded directly with the registry or registrar. DomainFactory acts as an agent (Geschäftsbesorger).
  - AGB § 17(1)(e): the provider may display its own page as long as the customer has not uploaded any content.
  - Restore (redemption): .de 29,99 €, .com 99,99 € (price list).
  - The AGB parts on the DSA and on the search function („Promoted“) have the same wording as at Host Europe. Probably the same corporate group (not further documented).
- Orientation (price list, retrieved 2026-11-12, gross):
  - .de: year 1 total 0,99 €, then 0,99 €/month (billed for 12 months)
  - .com: year 1 total 0,99 €, then 1,99 €/month (billed for 12 months)

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| vat_display | gross | „Alle Beträge inklusive gesetzlicher Mehrwertsteuer.“ | [Price list](https://www.df.eu/de/preislisten/) | 2026-11-12 |
| min_term_months | 12 | Price list: „Abrechnungszeitraum 12 Monate.“ FAQ: „…nach einer produktabhängigen initialen Laufzeit (z.B. bei Domains ein Jahr)…“ AGB § 5(2): initial term as per offer. | [Price list](https://www.df.eu/de/preislisten/), [FAQ termination](https://www.df.eu/de/support/df-faq/rechnung-vertrag/kuendigung/) | 2026-11-12 |
| notice_period_days | 30 („1 Monat“) per AGB § 5(2) and price list; 28 („4 Wochen“) per AGB § 17(4)(c) | AGB § 5(2): „…mit einer Frist von mindestens einem Monat zum Ende der Erstlaufzeit gekündigt werden.“ § 17(4)(c): „…beträgt für alle Domains 4 Wochen zum Ende der Laufzeit des Registrierungsverhältnisses.“ | [AGB](https://www.df.eu/de/agb/), [Price list](https://www.df.eu/de/preislisten/) | 2026-11-12 |
| billing_cycle | yearly (monthly price, billed 12 months in advance) | Price list: „Abrechnungszeitraum 12 Monate. … Entgelte sind jeweils für den jeweiligen Abrechnungszeitraum im Voraus zahlbar.“ | [Price list](https://www.df.eu/de/preislisten/) | 2026-11-12 |
| auto_renew_default | yes | Price list (Wiederherstellung/Domains): „Automatische Vertragsverlängerung um die Dauer des vereinbarten Abrechnungszeitraums; Kündigungsfrist 1 Monat.“ AGB § 5(2): „Anderenfalls wird der Vertrag mit unbegrenzter Laufzeit fortgeführt“ | [Price list](https://www.df.eu/de/preislisten/), [AGB](https://www.df.eu/de/agb/) | 2026-11-12 |
| price_change_notice | unknown | AGB § 6 is titled „…Entgelterhöhung…“, but only contains a VAT adjustment clause (§ 6(8)). No notice period and no special termination right found. The FAQ shows domain price adjustments from 20.08.2024. | [AGB](https://www.df.eu/de/agb/), [FAQ price adjustments](https://www.df.eu/de/support/df-faq/domains/domain-preisanpassungen/) | 2026-11-12 |
| setup_fee | not shown (domain table has no setup column) | Price list section „Domains“ | [Price list](https://www.df.eu/de/preislisten/) | 2026-11-12 |
| transfer_out | Fee unknown. DF may release domains that have not been moved in time after the end of the contract, or transfer them to the registry. | AGB § 17(4)(f): „…ist der Anbieter berechtigt, die Domains in die direkte Verwaltung der jeweiligen Vergabestelle zu überführen oder … freizugeben.“ | [AGB](https://www.df.eu/de/agb/) | 2026-11-12 |
| payment_methods | sepa (default), paypal | AGB § 6(3): „Soweit nicht anders vereinbart, erfolgen Zahlungen des Kunden durch SEPA-Lastschrifteinzug.“ § 6(4): „Bei Bezahlung über Paypal…“ | [AGB](https://www.df.eu/de/agb/) | 2026-11-12 |
| ssl_free | paid (optional) | Domain page: „SSL-Zertifikate für sicheren Datentransfer sind optional erhältlich“ | [Domains](https://www.df.eu/de/domains/) | 2026-11-12 |
| forward_301 | unknown (forwarding possible, type not stated) | FAQ „Weiterleitungsziele“: redirect can be set up in the customer menu | [FAQ forwarding](https://www.df.eu/de/support/df-faq/domains/weiterleitungsziele/) | 2026-11-12 |
| forward_302 | unknown | as above | as above | 2026-11-12 |
| dns_editor | yes | FAQ Nameserver: „Jetzt können Sie die vorhandenen Nameserver-Einträge ändern, neue hinzufügen…“ | [FAQ Nameserver](https://www.df.eu/de/support/df-faq/domains/nameserver/) | 2026-11-12 |
| custom_ns | yes | FAQ: „Wenn Sie eigene Nameserver betreiben, können Sie diese für Ihre Domains hinterlegen.“ | [FAQ Nameserver](https://www.df.eu/de/support/df-faq/domains/nameserver/) | 2026-11-12 |
| dnssec | unknown | no evidence found (web search and FAQ overview) | – | 2026-11-12 |
| email_forwarding | unknown | The domain page only mentions „Catchall für E-Mails an nicht existierende Adressen“. Forwarding not documented. | [Domains](https://www.df.eu/de/domains/) | 2026-11-12 |
| whois_privacy | none (no longer offered) | FAQ: „Diese Leistung bietet nun keinen wesentlichen Vorteil mehr und wird von uns ab sofort nicht weiter angeboten.“ | [FAQ private registration](https://www.df.eu/de/support/df-faq/domains/private-registrierung/) | 2026-11-12 |
| api | unknown | not found | – | 2026-11-12 |
| two_factor | unknown | Only MFA for Microsoft 365 accounts and 2FA for phpMyAdmin were found, not for the customer menu | [FAQ after migration](https://www.df.eu/de/support/df-faq/e-mail/migration/nach-migration/) | 2026-11-12 |

Open items:
- **Notice period conflict**: AGB § 5(2) and the price list state „1 Monat“. AGB § 17(4)(c) states „4 Wochen“ for domain termination orders. The AGB apply, but the AGB contradict themselves internally. The special domain rule (§ 17) probably takes precedence.
- **Renewal conflict**: the price list says „Verlängerung um die Dauer des vereinbarten Abrechnungszeitraums“ (12 months). AGB § 5(2) and the FAQ say: after the initial term, unlimited, terminable „taggenau mit der Frist eines Monats“, for services booked from 01.03.2022.
- **Termination form conflict**: AGB § 5(4) allows text form. Without activated online termination, the FAQ requires written form (fax, post, scan) and excludes e-mail.
- Price change clause: none found (VAT only). The PDF of the AGB was not cross-checked.
- **ROBOTS-DISALLOWED** (not fetched): `*/support/df-faq/domains/domainendungen/*` and `/fileadmin/downloads/`.
- Checked: robots.txt, Impressum, AGB (HTML), price list, domain page, FAQ (price adjustments, private registration, forwarding targets, name servers, termination, provider change .de, migration/MFA), policies page.

Price data (Archiv-Issue 75, checked 2026-11-15):
- Source: the domain page https://www.df.eu/de/domains/, static HTML. Its table „Alle Domainendungen“ is identical to the one on the price list /de/preislisten/ (230 TLDs, compared on 2026-11-15).
- Automated access: robots.txt (https://www.df.eu/robots.txt) allows `/de/domains/` and `/de/preislisten/`. The AGB (https://www.df.eu/de/agb/) contain no rule on automated access or scraping. Result: scraper adapter `domainfactory` (one request per run, UA `tldcost-bot`).
- Stated on the page: monthly prices for a 12-month billing period, gross („Alle Beträge inklusive gesetzlicher Mehrwertsteuer“), „Einrichtungsgebühr 0,00 €“, promo „Aktionspreis im 1. Jahr“ with the conditions „Das Angebot gilt nur einmal pro Kunde und für Neuregistrierungen“ (no end date), and „Diese Gebühr [ICANN] ist im angezeigten Preis enthalten“.
- Marker „#“ after most TLD labels (e.g. „.com #“; not on .de, .at, .ch): footnote „#Reseller-Rabatt: Rabattfähig auf Basis des für Sie geltenden Rabattniveaus.“ It marks TLDs that count for the reseller discount; it is no condition for other customers, so the offer does not carry it. The adapter checks the footnote on every run: a marked TLD fails if the footnote is missing or reads differently.
- Not collected: the volume discount in the price tooltip („Mengenrabatt“, e.g. „ab 50 Domains: -10%“). The table compares the price of one domain.
- Not sold: .dev, .app, .ai. Not stated: a transfer price („Der Transfer Ihrer Domain zu uns ist … kostenlos“ names no amount for the term), so `transfer_in` stays null.

## Hetzner (`hetzner`)

- Operator: Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, Germany; Registergericht Ansbach HRB 6089; VAT ID DE 812871812 ([Impressum](https://www.hetzner.com/de/legal/legal-notice/), retrieved 2026-11-12)
- Price list: there are two channels.
  - **Robot** („Domain Registration Robot“): https://www.hetzner.com/de/registrationrobot/ (public, static HTML, only 8 TLDs).
  - **konsoleH** („Domain Check“): https://www.hetzner.com/de/whois/ (the old path https://www.hetzner.com/de/domainregistration/ points there). Both respond to the fetcher with a 307 loop to themselves (openresty, probably a cookie or bot check) and were not bypassed.
- AGB: https://www.hetzner.com/de/legal/terms-and-conditions/ (version: „Version 2.0.0 / Stand 27.10.2021“, PDF: https://cdn.hetzner.com/assets/Uploads/downloads/AGB.pdf). For domains, the allocation terms (Vergabebedingungen) apply in addition: https://www.hetzner.com/de/legal/allocating-terms/ (registry links per TLD and Registrant Agreement for .com/.net). No separate service description for domains was found.
- Price display: the website shows gross prices with Germany as the default country („inkl. 19 % MwSt.“). AGB section 4.1, by contrast, is worded as net: „zu den aktualisierten Preisen … zzgl. gesetzlicher Umsatzsteuer berechnet“. This is a question of wording, not a contradiction in the amount.
- Notes:
  - **Two separate domain channels with different prices.**
    - Robot: only .de/.at/.com/.net/.org/.info/.biz/.eu. The Robot product is free, but must be ordered. You create handles yourself, so it is more of a reseller or professional tool.
    - konsoleH: domain registration „ab 5,83 € / Jahr“, channel for web hosting/managed customers.
    - Robot .de costs 3,90 €/year plus 2,00 € one-time setup, konsoleH from 5,83 €/year. For the table, it must be decided which channel counts as "Hetzner".
  - Web hosting packages do not include a domain. For externally registered domains in web hosting, 0,76 €/month is charged ([Webhosting](https://www.hetzner.com/de/webhosting/)).
  - Robot prices are shown as „jährlich“. Registration and renewal are not shown separately; it only says „…-Registrierung“.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Hetzner Online GmbH, Gunzenhausen, DE | Impressum: „Hetzner Online GmbH Industriestr. 25 91710 Gunzenhausen Deutschland“ | [Impressum](https://www.hetzner.com/de/legal/legal-notice/) | 2026-11-12 |
| price_page | Robot: /de/registrationrobot/ (accessible). konsoleH: /de/whois/ (307 loop, not accessible) | – | [Registration Robot](https://www.hetzner.com/de/registrationrobot/) | 2026-11-12 |
| terms | AGB version 2.0.0, as of 27.10.2021, plus allocation terms for domains | AGB section 1.6: „Soweit Domains Gegenstand dieses Vertrages sind, gelten ergänzend die entsprechenden Vergabebedingungen“ | [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/), [Vergabebedingungen](https://www.hetzner.com/de/legal/allocating-terms/) | 2026-11-12 |
| vat_display | gross (default country DE, 19 %) | Robot page: „.de-Registrierung 3,90 €, inkl. 19 % MwSt.“ | [Registration Robot](https://www.hetzner.com/de/registrationrobot/) | 2026-11-12 |
| min_term_months | 12 (in practice, because each domain is billed for a full year). There is no explicit „Mindestlaufzeit“ for domains. The AGB state „unbestimmte Zeit“. | Docs: „Domains werden generell für ein volles Jahr abgerechnet, unabhängig davon, wann sie gekündigt werden.“ AGB section 2.5: „Soweit nicht anders vereinbart, werden die Verträge auf unbestimmte Zeit geschlossen.“ | [Docs termination konsoleH](https://docs.hetzner.com/de/general/billing-and-account-management/cancellation/cancellations-managed-products/), [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| notice_period_days | 30 (to the end of the month). The AGB allow different periods „je nach Leistungsbeschreibung“; no domain service description was found. | AGB section 2.6: „Der Vertrag ist von beiden Seiten mit einer Frist von 30 Tagen zum Monatsende, ohne Angabe von Gründen kündbar.“ | [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| billing_cycle | yearly | Robot price list, column „jährlich“. Docs: „Domains werden generell für ein volles Jahr abgerechnet“ | [Registration Robot](https://www.hetzner.com/de/registrationrobot/), [Docs termination](https://docs.hetzner.com/de/general/billing-and-account-management/cancellation/cancellations-managed-products/) | 2026-11-12 |
| auto_renew_default | yes (contract for an indefinite period). Docs konsoleH: if the domain is kept when the hosting is cancelled, „wird [sie] weiterhin regulär abgerechnet“. | AGB section 2.5 (see above); Docs: „Die Domain bleibt aktiv und wird weiterhin regulär abgerechnet.“ | [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/), [Docs termination](https://docs.hetzner.com/de/general/billing-and-account-management/cancellation/cancellations-managed-products/) | 2026-11-12 |
| price_change_notice | yes, prior notification. A special termination right and a notice period are not stated in the AGB. | AGB section 1.3: „Wir behalten uns Änderungen unserer Allgemeinen Geschäftsbedingungen, Systemrichtlinien und Preise durch vorherige Mitteilung … ausdrücklich vor.“ | [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/) | 2026-11-12 |
| setup_fee | Robot: .de 2,00 € one-time (gross); none stated for other Robot TLDs. konsoleH: unknown. | Robot page: „2,00 € einmalige Einrichtungsgebühr, inkl. 19 % MwSt.“ (for .de registration) | [Registration Robot](https://www.hetzner.com/de/registrationrobot/) | 2026-11-12 |
| transfer_out | Robot: auth code can be viewed or generated in the Robot (valid 30 days for .de, 40 days for .eu). konsoleH: auth code only after the termination is completed with the option „zu einem anderen Provider gezogen“. No fee is stated in either case. | Docs konsoleH: „Der Auth-Code wird erst nach Abschluss der Domainkündigung bereitgestellt.“ / Docs Robot: „Der Authcode hat eine Gültigkeit von 30 Tagen.“ (.de) | [Docs auth code konsoleH](https://docs.hetzner.com/de/managed/domain-and-dns/auth-code-konsoleh/), [Docs outgoing provider change Robot](https://docs.hetzner.com/de/robot/domain-registration-robot/tutorial-chprov-outgoing/) | 2026-11-12 |
| payment_methods | card (VISA, Mastercard, AMEX, UnionPay), sepa (EUR accounts only), invoice (bank transfer), paypal (manual only); no partial or installment payments | Docs: „Kreditkarte … SEPA-Lastschrift … Banküberweisung … PayPal Nur manuelle Zahlung über Hetzner Accounts möglich.“ | [Docs payment overview](https://docs.hetzner.com/de/general/billing-and-account-management/billing-at-hetzner/payment-overview/) | 2026-11-12 |
| ssl_free | unknown for domain-only (there is a separate SSL product page /de/sslzertifikate/, not checked) | – | – | 2026-11-12 |
| forward_301 | unknown | checked: Robot page, Robot FAQ, DNS page; no mention | – | 2026-11-12 |
| forward_302 | unknown | as above | – | 2026-11-12 |
| dns_editor | free (Hetzner Console DNS, standard limit of 25 zones) | DNS page: „Das DNS-Management ist ohne zusätzliche Kosten nutzbar.“ | [DNS Management](https://www.hetzner.com/de/dns/) | 2026-11-12 |
| custom_ns | yes (Robot; custom name servers must be registered first for vanity NS) | Docs Robot: „Eigene Nameserver haben den Vorteil … und sie kosten nichts.“ | [Docs getting started Robot](https://docs.hetzner.com/de/robot/domain-registration-robot/getting-started/) | 2026-11-12 |
| dnssec | no (Hetzner Console DNS). Whether DS records can be set via Robot/konsoleH for external DNS is unknown. The Console supports DS as a record type. | DNS page: „Die Hetzner Console unterstützt zum aktuellen Zeitpunkt das Feature DNSSEC nicht.“ | [DNS Management](https://www.hetzner.com/de/dns/) | 2026-11-12 |
| email_forwarding | unknown for domain-only (mail only via web hosting) | – | – | 2026-11-12 |
| whois_privacy | unknown | checked: Robot page, Robot FAQ, AGB, allocation terms | – | 2026-11-12 |
| api | yes: Robot has an e-mail interface for domain actions, DNS via REST API (api.hetzner.cloud). A REST API for registration itself is not mentioned. | Docs Robot FAQ: „Ja, der Domain Registration Robot verfügt über eine E-Mail-Schnittstelle, die für alle DNS-/Domainbezogenen Aktionen genutzt werden kann.“ | [Docs Robot FAQ](https://docs.hetzner.com/de/robot/domain-registration-robot/faq/), [DNS Management](https://www.hetzner.com/de/dns/) | 2026-11-12 |
| two_factor | yes (Hetzner Accounts) | Docs: „Um die Zwei-Faktor-Authentifizierung (kurz 2FA) zu aktivieren, loggst du dich in Hetzner Accounts ein.“ | [Docs 2FA](https://docs.hetzner.com/de/general/security-and-identify/two-factor-authentication/) | 2026-11-12 |
| sample .de (Robot) | 3,90 €/year gross, plus 2,00 € one-time setup; .de transfer 3,90 € | Robot page | [Registration Robot](https://www.hetzner.com/de/registrationrobot/) | 2026-11-12 |
| sample .com (Robot) | 17,26 €/year gross. For .com/.net: „Restore“ fee 61,88 € | Robot page: „.com-Registrierung * 17,26 €, inkl. 19 % MwSt.“ | [Registration Robot](https://www.hetzner.com/de/registrationrobot/) | 2026-11-12 |
| sample konsoleH | „ab 5,83 €/Jahr“ gross (TLD not stated) | Webhosting page: „Domainregistrierung ist bei Hetzner ab 5,83 €, inkl. 19 % MwSt. / Jahr möglich.“ | [Webhosting](https://www.hetzner.com/de/webhosting/) | 2026-11-12 |

Open items:
- **Blocked:** https://www.hetzner.com/de/whois/ and https://www.hetzner.com/de/domainregistration/ respond with a 307 loop to the same URL (probably a cookie or bot check). They are not disallowed by robots.txt, but were deliberately not bypassed. As a result, konsoleH prices per TLD, the konsoleH setup fee and the konsoleH TLD selection are unknown. An adapter would need a different source or manual collection.
- **Channel decision (Archiv-Issue 75, 2026-11-15):** Robot prices, see „Price data (Archiv-Issue 75)“ above. konsoleH stays unavailable for automated collection.
- **Notice period vs. yearly billing:** AGB section 2.6 states 30 days to the end of the month. The docs say domains are „für ein volles Jahr abgerechnet, unabhängig davon, wann sie gekündigt werden“. So the effective commitment is 12 months per period. A deadline before the end of the domain period is not explicitly regulated.
- Price change: the AGB only mention a „vorherige Mitteilung“, without a notice period and without a special termination right.
- Whether Robot prices are initial or renewal prices is not stated („Registrierung“, „jährlich“). They are probably identical, but this is not documented.
- Not found: Whois privacy, web and e-mail forwarding for domain-only, free SSL.

Price data (Archiv-Issue 75, 2026-11-15):
- **Automated access:** [robots.txt](https://www.hetzner.com/robots.txt) allows everything except the internal search (`Disallow: /*?search=`). The [AGB](https://www.hetzner.com/de/legal/terms-and-conditions/) (version 2.0.0) contain no clause on automated access. Both checked 2026-11-15.
- **Source:** the Robot price list https://www.hetzner.com/de/registrationrobot/, scraped (adapter `hetzner`). Static HTML table „Preise“ with the columns „jährlich“ and „einmalig“; gross amounts for Germany, e.g. „.de-Registrierung 3,90 €, inkl. 19 % MwSt.“, „2,00 € einmalige Einrichtungsgebühr“, „.de-Transfer 3,90 €“.
- **Channel decision:** Hetzner rows use the Robot prices, because the Robot list is the only public per-TLD price source. konsoleH (`/de/whois/`) still answers with a 307 loop to itself (checked 2026-11-15) and is not bypassed.
- **TLDs:** the Robot sells only .de, .com, .net, .org, .eu, .info, .at and .biz. **.io and the other MVP TLDs are not offered** through the Robot, so there is no Hetzner offer for them.
- **Mapping:** the single yearly amount is used as year1 and renewal (the page states no separate renewal price), hence `confidence: medium`. Setup is 0 where the „einmalig“ column shows a cross; .de has 2,00 € setup. `transfer_in` only for .de (the only transfer price listed). The restore fee for .com/.net (61,88 €) is not a table field.

## Host Europe (`host-europe`)

- Operator: Host Europe GmbH, c/o WeWork Wallarkaden, Pilgrimstr. 6, 50674 Köln, Germany; Amtsgericht Köln HRB 28495; same management as DomainFactory. The source is the header of the [AGB PDF](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf) (retrieved 2026-11-12). The [Impressum page](https://www.hosteurope.de/Impressum/) is rendered client-side and returns no text.
- Price list: https://www.hosteurope.de/Domain-Namen/Preise/. The page is rendered client-side (empty HTML shell, no embedded price data). The FAQ https://www.hosteurope.de/faq/domains/allgemeines-domains/preisangleichung_okt_2024 (valid from 13.10.2024) is used as the price source instead.
- AGB: https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf (as of: 07.05.2026), domain rules in § 13 „Besondere Bedingungen für Domains“. Older price and service list Domain & E-Mail Basic: https://www.hosteurope.de/download/PVL/Preis_und_Leistungsverzeichnis_Domain___Mail__V.3.0.pdf (as of: June 2017, probably outdated).
- Price display: gross. FAQ: „Alle Angaben sind in Euro und beziehen sich auf den Monatspreis je TLD inklusive 19% deutscher Mehrwertsteuer…“
- Notes:
  - **Monthly prices with a selectable yearly or monthly contract term**. With a monthly term the price is higher (.de 0,99 € yearly vs. 1,24 € monthly).
  - Volume discount tiers: discount tier 1 from 50, tier 2 from 200 domains in the account.
  - AGB § 13(1): the contract is concluded directly with the registry or registrar. Host Europe acts as an agent (Geschäftsbesorger).
  - A promotional price in year 1 is **not verified**. According to a web search snippet, the home page shows „0,08 €/Monat im ersten Jahr“ (new customers only, 1 domain). The page is rendered client-side and was not fetched. Superseded by the manual entry (Archiv-Issue 77) below.
  - Domain notice periods are **TLD-dependent and longer than usual** (6 weeks or 3 months, see table).
- Orientation (FAQ price alignment Oct. 2024, retrieved 2026-11-12, monthly price gross, regular price yearly / monthly):
  - .de: 0,99 € / 1,24 €
  - .com: 1,99 € / 2,49 €
  - Year-1 promotion: unknown (2026-11-12; see the manual entry Archiv-Issue 77 below)

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| vat_display | gross | „…Monatspreis je TLD inklusive 19% deutscher Mehrwertsteuer…“ | [FAQ price alignment](https://www.hosteurope.de/faq/domains/allgemeines-domains/preisangleichung_okt_2024) | 2026-11-12 |
| min_term_months | 1 or 12 (selectable, per FAQ price table) | FAQ: „…unterteilt nach … monatlicher und jährlicher Laufzeit des Domainvertrages.“ AGB § 4(2) consumers: initial term as agreed. Old PVL 2017: „Mindest- und Folgevertragslaufzeit betragen 12 Monate.“ | [FAQ price adjustment Aug. 2024](https://www.hosteurope.de/faq/domains/allgemeines-domains/preisanpassung_aug_2024), [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf) | 2026-11-12 |
| notice_period_days | 42 („sechs Wochen“) for .de, .at, .com, .net, .org, .biz, .info, .eu; 90 („drei Monate“) for all other TLDs | AGB § 13(10): „….info, .eu sechs Wochen zum Ende der Vertragslaufzeit des Registrierungsverhältnisses, für alle anderen Domains drei Monate.“ | [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf) | 2026-11-12 |
| billing_cycle | monthly or yearly (depending on term), in advance | AGB § 5(1): „Nutzungsunabhängige Entgelte sind für die jeweilige Vertragslaufzeit im Voraus fällig und zahlbar…“. FAQ: yearly/monthly contract term | [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf), [FAQ](https://www.hosteurope.de/faq/domains/allgemeines-domains/preisangleichung_okt_2024) | 2026-11-12 |
| auto_renew_default | yes | AGB § 4(2): „Anderenfalls wird der Vertrag mit unbegrenzter Laufzeit fortgeführt („Folgelaufzeit“).“ § 13(11): if termination is late, the registration is renewed and the payment obligation remains. | [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf) | 2026-11-12 |
| price_change_notice | unknown | No price change clause found in the AGB (07.05.2026) (search for „erhöh“, „Preisänder“, „Preisanpass“). The FAQ documents price adjustments on 13.08.2024 and 13.10.2024. | [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf), [FAQ Aug. 2024](https://www.hosteurope.de/faq/domains/allgemeines-domains/preisanpassung_aug_2024) | 2026-11-12 |
| setup_fee | none (price page, checked by hand in a browser 2026-11-15, see the manual entry Archiv-Issue 77 below) | Price page not readable (JS) on 2026-11-12. The FAQ tables state no setup fee. | – | 2026-11-15 |
| transfer_out | Release in the KIS or in writing (fax, post, scan). Release valid for 30 days. Auth code in the KIS or by e-mail (usually within 2 business days). Fee not stated. | FAQ: „Freigaben werden immer zu sofort erfasst und sind 30 Tage gültig.“ | [FAQ releases](https://www.hosteurope.de/faq/domains/verwaltung/freigaben-domains-erteilen) | 2026-11-12 |
| payment_methods | sepa (default), paypal | AGB § 5(3): „Soweit nicht anders vereinbart, erfolgen Zahlungen des Kunden durch SEPA-Lastschrifteinzug.“ § 5(4): „Bei Bezahlung über Paypal…“ | [AGB](https://www.hosteurope.de/download/2026-05-07_Host%20Europe%20GmbH_Allgemeine%20Gesch%C3%A4ftsbedingungen.pdf) | 2026-11-12 |
| ssl_free | unknown | not found (product pages JS) | – | 2026-11-12 |
| forward_301 | unknown (redirect possible, type not stated) | FAQ name server entries mentions „URL-Weiterleitung (Redirect)“ | [FAQ name server entries](https://www.hosteurope.de/faq/domains/verwaltung/nameserver-eintraege) | 2026-11-12 |
| forward_302 | unknown | as above | as above | 2026-11-12 |
| dns_editor | yes | „Im Kunden-Informationssystem (KIS) haben Sie die Möglichkeit, DNS-Einträge für Ihre Domains auf unseren Nameservern vorzunehmen.“ | [FAQ name server entries](https://www.hosteurope.de/faq/domains/verwaltung/nameserver-eintraege) | 2026-11-12 |
| custom_ns | yes | „Wenn Sie eigene/externe Nameserver für Ihre Domain verwenden möchten, dann führen Sie bitte ein Update der Domain durch…“ | [FAQ name server entries](https://www.hosteurope.de/faq/domains/verwaltung/nameserver-eintraege) | 2026-11-12 |
| dnssec | n/a (on Host Europe name servers) | FAQ Premium DNS: „Nein, unsere Premium DNS-Nameserver unterstützen DNSSEC derzeit nicht.“ | [FAQ Premium DNS](https://www.hosteurope.de/faq/domains/allgemeines-domains/premium_dns) | 2026-11-12 |
| email_forwarding | unknown | not found | – | 2026-11-12 |
| whois_privacy | unknown | not found | – | 2026-11-12 |
| api | unknown | not found (a reseller domain robot exists according to a web search, not documented for end customers) | – | 2026-11-12 |
| two_factor | unknown | not found | – | 2026-11-12 |

Open items:
- **Notice period conflict**: AGB § 4(2) states 1 month in general. AGB § 13(10) states 6 weeks or 3 months for domain termination orders; this domain rule is more specific and applies per § 4(5). The old PVL 2017 states „4 Wochen zum Vertragsende“ (outdated). The footnote on the current price page (2026-11-15, see „Price data“ below) also states „mit einer Frist von 1 Monat“ for consumers, which agrees with § 4(2) but not with § 13(10).
- **Term and billing conflict**: the PVL 2017 says „jährlich im Voraus, Mindest- und Folgevertragslaufzeit betragen 12 Monate“. The 2024 FAQ price tables show yearly and monthly terms. The PVL is probably outdated; no current domain PVL was found.
- Price page, home page and Impressum are a JS SPA. The content is probably loaded via a third-party content API (host `green.lexicon.api.heg-cp.com` in the HTML head); it was deliberately not queried. This is why the promotional price, setup fee, SSL and 2FA are `unbekannt`.
- No robots blocks were hit (robots.txt only blocks `*?kwk`, `*/sys/` and similar).
- Checked: robots.txt, Impressum (JS), price page (JS), AGB PDF 07.05.2026, PVL Domain & Mail 2017, FAQ (domains index, price alignment Oct. 2024, price adjustment Aug. 2024, Premium DNS, releases, name server entries, delete domain).

Price data (Archiv-Issue 75, checked 2026-11-15):
- Price page: https://www.hosteurope.de/Domain-Namen/Preis/ (the old URL `/Domain-Namen/Preise/` now shows „Seite nicht gefunden (404)“). Prices are stated as monthly prices, gross: „Alle Angaben in € als Monatspreise je TLD inklusive 19% deutsche Mehrwertsteuer“.
- Bundling rule (domains only with another contract): **not affected**. Domains are sold as standalone contracts; the price page footnote: „Privatkunden: Die Mindestvertragslaufzeit beträgt 12 Monate. Der Vertrag verlängert sich auf unbestimmte Zeit, sollte er nicht mit einer Frist von 1 Monat gekündigt worden sein.“ No hosting contract is required.
- Automated access: robots.txt (https://www.hosteurope.de/robots.txt) does not block the page. But the page is a JavaScript app (prices loaded through an internal API) with a bot-protection sensor script. Under the Methodik rule this rules out automated access: **no adapter and no automated reading**, not even a single headless visit.
- Discarded check: before this rule was applied, the page was opened about 7 times in a headless browser on 2026-11-15 (one session, polite pace). The values read there were discarded and never committed; they are not a source for any offer.
- Result: no offers from tldcost's own collection. The prices follow by **manual entry in a browser by a person**; the TLD list (all MVP TLDs Host Europe sells, including .net and .org, promo conditions verbatim) is tracked in Archiv-Issue 77.
- Same group as DomainFactory, but **not the same prices**: several TLDs differ (e.g. .info, .me, .shop), so the DomainFactory source does not cover Host Europe.

Manual entry (Archiv-Issue 77): manuell im Browser geprüft, 2026-11-15, kein gespeicherter Abruf. The owner read the [price page](https://www.hosteurope.de/Domain-Namen/Preis/) in a browser; tldcost made no request. The offers have `method: manual`, `confidence: medium` and no `evidence_hash`.
- 17 TLDs: .de .at .ch .eu .com .net .org .info .biz .io .co .me .online .shop .xyz .cloud .berlin. **Not offered:** .ai, .app, .dev.
- Gross monthly prices: „Alle Angaben in € als Monatspreise je TLD inklusive 19% deutsche Mehrwertsteuer“. The offers use the monthly price with a 12-month term (`unit: month`). With a monthly term the price is higher (e.g. .de 1,24 €/Monat, .com 2,49 €/Monat); that variant is not recorded.
- Promo prices, conditions verbatim from the page:
  - .de and .com 0,08 €/Monat: „.de & .com nur für Neukunden, Neuregistrierungen und eine pro Kunde.“ → `promo.max_per_customer: 1`, `limit_scope: per_customer`, with this quote as source.
  - .eu .info .biz .io .co .me .online .shop: „Alle anderen TLDs unbegrenzt, jedoch nur für Neuregistrierungen.“ → `limit_scope: unlimited` (Archiv-Issue 116), `max_per_customer: null`, with this quote and the price page as source. The portfolio calculator gives every domain of these TLDs the promo, outside the per-customer pool.
- `transfer_in: null`: the price page shows no transfer price.
- Footnotes: .io „Providerwechsel mit dieser Endung derzeit nicht möglich“ (footnote 2); .berlin without a seat in Berlin gets a trustee Admin-C (footnote 3).
- `setup: 0`: Einrichtungsgebühr: keine (Preisseite, manuell im Browser geprüft 2026-11-15).

## INWX (`inwx`)

- Operator: INWX GmbH, Prinzessinnenstr. 30, 10969 Berlin, Germany; AG Berlin-Charlottenburg HRB 237141 B; VAT ID DE814537105 ([Impressum](https://www.inwx.de/de/aboutus/imprint), retrieved 2026-11-12)
- Price list: https://www.inwx.de/de/domain/pricelist. The page loads the standard prices per TLD client-side. The server HTML only contains the volume discount prices for business customers (>250/>1000/>3000 domains, net). TLD pages such as https://www.inwx.de/de/de-domain and https://www.inwx.de/de/com-domain contain the hero price, minimum term, notice period and feature flags in the HTML; the price fields of the table are also JS there.
- AGB: https://www.inwx.de/de/aboutus/terms („Gültig ab 30. Dezember 2021“). For domains, the **Vertrag zur Registrierung von Domains** (domain registration contract) applies: https://www.inwx.de/de/aboutus/termsdomains („Stand: 01.07.2024“, numbered list, cited below as „Nr.“). In addition, the registries' registration terms apply.
- Price display: probably gross. The price list has the toggle „Nettopreis anzeigen“, and the country setting says „Land auswählen, um die MwSt. anzupassen“. It is not stated explicitly on the pages fetched. The volume discount tiers are explicitly net.
- Notes:
  - Billing via a **prepaid balance account**. Auto-renewal only applies if there is a balance, a direct debit agreement or a credit limit. Otherwise the domain is deleted or returned to the registry.
  - For .de, the TLD page states **„Mindestlaufzeit 1 Monat“** and shows the fields „Registrierungspreis (monatlich)“ and „Verlängerungsgebühr (monatlich)“. For .com: „Mindestlaufzeit 12 Monate“. This contradicts the domain contract (renewal „von Jahr zu Jahr“) and the note on the price list („Alle Preise inklusive einem Jahr Laufzeit“). Whether .de is billed monthly is unclear, see open items.
  - According to the KB, domain registrations are excluded from the right of withdrawal (§ 312g Abs. 2 Nr. 1 BGB, individual service).
  - INWX is itself an accredited registrar („Akkreditierungen“ page, not checked in detail).

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | INWX GmbH, Berlin, DE | Impressum: „INWX GmbH Prinzessinnenstr. 30 10969 Berlin Deutschland“ | [Impressum](https://www.inwx.de/de/aboutus/imprint) | 2026-11-12 |
| price_page | https://www.inwx.de/de/domain/pricelist (JS); TLD pages `/de/<tld>-domain` | – | [Price list](https://www.inwx.de/de/domain/pricelist) | 2026-11-12 |
| terms | AGB valid from 30.12.2021; domain contract as of 01.07.2024 | Domain contract: „Im Übrigen gelten die Allgemeinen Geschäftsbedingungen von INWX, sowie die jeweiligen Vergaberichtlinien der einzelnen Registrierungsstellen“ | [AGB](https://www.inwx.de/de/aboutus/terms), [Domain contract](https://www.inwx.de/de/aboutus/termsdomains) | 2026-11-12 |
| vat_display | gross (default), net switchable. Derived from the toggle, not stated explicitly. | Price list: „Nettopreis anzeigen“. Note: „Unsere Rabattstaffeln … verstehen sich netto zuzüglich der jeweils gültigen Umsatzsteuer.“ | [Price list](https://www.inwx.de/de/domain/pricelist) | 2026-11-12 |
| min_term_months | 12 (domain contract, price list, .com page). **Deviation on .de page: 1 month** | Domain contract Nr. 6: „Domains werden von INWX stillschweigend automatisch von Jahr zu Jahr verlängert“. Price list: „Alle Preise inklusive einem Jahr Laufzeit.“ .com page: „Mindestlaufzeit 12 Monate“. .de page: „Mindestlaufzeit 1 Monat“ | [Domain contract](https://www.inwx.de/de/aboutus/termsdomains), [Price list](https://www.inwx.de/de/domain/pricelist), [.com](https://www.inwx.de/de/com-domain), [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| notice_period_days | Domain: termination before the renewal date (TLD pages .de/.com: „Kündigungsfrist 1 Tag(e)“ → 1). Framework contract: 1 month to the end of the month. General AGB: 4 weeks. | Domain contract Nr. 7: „Die Kündigung einer Domain muss vor dem jeweiligen Verlängerungsdatum durchgeführt werden.“ Nr. 5: „Die Kündigungsfrist beträgt für beide Seiten einen Monat zum Monatsende.“ AGB § 4: „Kündigungsfrist von 4 Wochen nach einer Mindestlaufzeit von 1 Monat“ | [Domain contract](https://www.inwx.de/de/aboutus/termsdomains), [.de](https://www.inwx.de/de/de-domain), [AGB](https://www.inwx.de/de/aboutus/terms) | 2026-11-12 |
| billing_cycle | yearly, in advance from the balance. For .de possibly monthly (see conflict). | Domain contract Nr. 8: „Die entstehenden Gebühren sind jeweils für den Abrechnungszeitraum im Voraus zu entrichten. … findet keine Rückerstattung der Gebühren statt.“ | [Domain contract](https://www.inwx.de/de/aboutus/termsdomains) | 2026-11-12 |
| auto_renew_default | yes, but only with sufficient balance, a direct debit agreement or a credit limit | Domain contract Nr. 6: „Domains werden von INWX stillschweigend automatisch von Jahr zu Jahr verlängert, sofern der benötigte Betrag vorab auf das persönliche Guthabenkonto eingezahlt wurde“ | [Domain contract](https://www.inwx.de/de/aboutus/termsdomains) | 2026-11-12 |
| price_change_notice | yes: by e-mail at least 2 months before taking effect, with a right to object until the effective date. A special termination right is not stated explicitly. | AGB § 4: „Preisänderungen werden spätestens 2 Monate vor Inkrafttreten per Email mitgeteilt. Sollte der Kunde nicht bis zum Geltungsbeginn widersprechen, so gelten sie als angenommen.“ | [AGB](https://www.inwx.de/de/aboutus/terms) | 2026-11-12 |
| setup_fee | .com: free. .de: field „Einrichtungsgebühr EINMALIG“ present, amount loaded via JS, so unknown. | .com page: „Einrichtungsgebühr kostenlos“ | [.com](https://www.inwx.de/de/com-domain), [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| transfer_out | free if the customer handles the transfer themselves via the web interface. No refund for partial periods. Whois Privacy must be deactivated first. | Domain contract Nr. 3: „Transfer-Anträge weg von INWX werden nicht gesondert berechnet, wenn der Kunde die abgehenden Transfer-Anträge selbst über die Webschnittstelle von INWX bearbeitet.“ | [Domain contract](https://www.inwx.de/de/aboutus/termsdomains), [Whois Privacy](https://www.inwx.de/de/offer/whoisprivacy) | 2026-11-12 |
| payment_methods | prepaid (balance account), invoice/bank transfer, paypal (PayPal fees are passed on 1:1), sepa (direct debit agreement mentioned). Credit card: unknown. | KB: „Für kurzfristige Zahlungen lässt sich auch PayPal nutzen.“ / „PayPal-Transaktionsgebühren reichen wir 1:1 an den Kunden weiter.“ Domain contract Nr. 6: „(z.B. Zahlung per Lastschrift)“ | [KB credit](https://kb.inwx.com/de-de/4-buchhaltung/81-wann-wird-meine-zahlung-gutgeschrieben), [KB PayPal fees](https://kb.inwx.com/de-de/25-paypal/80-werden-mir-fur-paypal-zahlungen-gebuhren-berechnet), [Domain contract](https://www.inwx.de/de/aboutus/termsdomains) | 2026-11-12 |
| ssl_free | unknown (SSL certificates are sold as a separate product, /de/ssl not checked) | – | – | 2026-11-12 |
| forward_301 | free (included, default forwarding) | KB: „Standardmäßig erfolgt die Weiterleitung als Header-Redirect Typ 301 (Moved permanently).“ .de page: „Header- und Frame-Redirect möglich“ (included service) | [KB forwarding](https://kb.inwx.com/de-de/3-nameserver/106-wie-kann-ich-eine-domain-auf-eine-internetadresse-weiterleiten), [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| forward_302 | free (included) | KB: „Sie haben weiterhin die Wahl zwischen Typ 302 (Moved temporarily) oder einer Frame-Weiterleitung.“ | [KB forwarding](https://kb.inwx.com/de-de/3-nameserver/106-wie-kann-ich-eine-domain-auf-eine-internetadresse-weiterleiten) | 2026-11-12 |
| dns_editor | free (included) | .de page, included services: „Echtzeit-Nameserververwaltung“, „Ausfallsicherheit durch drei Nameserver“ | [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| custom_ns | free (included), plus virtual name servers and secondary DNS | .de page: „Eigene Nameserver möglich - Virtuelle Nameserver möglich - Secondary DNS bei eigenen Nameservern“ | [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| dnssec | yes (signed automatically with INWX NS, or manually with own keys). Flag .de: „Ja (DNSKEY)“, .com: „Ja (DS)“ | KB: „Bei INWX bieten wir Ihnen die Möglichkeit an Ihre Domain vollautomatisch signieren zu lassen“ | [KB DNSSEC](https://kb.inwx.com/de-de/3-nameserver/104-kann-ich-dnssec-nutzen) | 2026-11-12 |
| email_forwarding | paid (only with a hosting package) | KB: „Um eine E-Mail Adresse anlegen zu können benötigen Sie eines unserer Hosting-Pakete.“ | [KB e-mail for the domain](https://kb.inwx.com/de-de/27-e-mail/193-ich-habe-eine-domain-registriert-wie-bekomme-ich-nun-die-passende-e-mail-adresse-zu-dieser-domain) | 2026-11-12 |
| whois_privacy | paid: 4,19 €/year net for the 16 TLDs with an INWX offer outside .de/.eu/.at (CSV price list, column „Whois Privacy“; see the note below the table). Earlier reading: .com page JSON `whoisProtectionPrice: 4.1933`. .de: n/a („Whois Privacy Nein“), trustee available for .de. .eu and .at: unknown (`null`, k. A.); no INWX source checked for them (the earlier `n/a` had none) | .com page: „Whois Privacy Ja ( / Jahr )“. .de page: „Whois Privacy Nein“ | [.com](https://www.inwx.de/de/com-domain), [.de](https://www.inwx.de/de/de-domain), [Whois Privacy](https://www.inwx.de/de/offer/whoisprivacy) | 2026-11-12 |
| api | yes, included (XML-RPC/JSON-RPC) | .de page: „API-Programmierschnittstelle (XML-RPC/JSON-RPC)“ | [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| two_factor | yes (Mobile-TAN = TOTP, free, also applies to API access) | KB: „Für die Nutzung ist nur die Installation einer Authenticator App erforderlich, die den TOTP Standard Unterstützt.“ | [KB Mobile-TAN](https://kb.inwx.com/de-de/5-kundendaten/70-was-ist-mobile-tan-und-wie-aktiviere-ich-es) | 2026-11-12 |
| sample .de | Hero „für nur 5,02 €“ (JSON-LD `price: 5.02`). Period (year or month?) and gross/net are not labeled on the page. Renewal price: JS, unknown. | .de page: „Sichere dir jetzt deine .de Wunschdomain für nur 5,02 €“ | [.de](https://www.inwx.de/de/de-domain) | 2026-11-12 |
| sample .com | Hero „für nur 15,50 €“ (JSON-LD `price: 15.5`), period and gross/net not labeled. Renewal price: JS, unknown. | .com page: „für nur 15,50 €“ | [.com](https://www.inwx.de/de/com-domain) | 2026-11-12 |

Open items:
- **Minimum term/billing conflict for .de:** the .de page states „Mindestlaufzeit 1 Monat“ and monthly price fields. Domain contract Nr. 6 and the price list state „von Jahr zu Jahr“ and „ein Jahr Laufzeit“. The domain contract takes precedence; the statement on the .de page is recorded. Clarify with the rendered price (JS) or with support whether .de can be billed monthly.
- **Notice period conflict:** three levels are possible: AGB § 4 (4 weeks), domain contract Nr. 5 (1 month to the end of the month, probably concerns the framework contract) and domain contract Nr. 7 or the TLD page (before the renewal date, „1 Tag(e)“). For the domain, Nr. 7 is authoritative (more specific contract). The interpretation should be checked before publication.
- The page loads the standard prices (registration, renewal, transfer per TLD) via JS. Hero prices are in the HTML or JSON-LD. The adapter needs a public price endpoint or a CSV (per the concept "Reseller-API/Preisliste", not searched for).
- Gross/net of the hero prices is not labeled explicitly. Arithmetically, 5,02 € = 4,22 € × 1,19. This is an indication of gross, but not proof.
- Credit card as payment method: unknown. Free SSL: unknown.

Whois privacy price (Archiv-Issue 124, `feature_costs.whois_privacy`):
- Source: the official CSV price list https://www.inwx.de/de/domain/pricelist/vat/1/file/csv, column „Whois Privacy“. [robots.txt](https://www.inwx.de/robots.txt) (2026-11-15): `User-Agent: *` with an empty `Disallow:`, so everything is allowed. The adapter `inwx` uses the same CSV as its fallback source.
- Fetched once on 2026-11-15T11:12:18Z as `tldcost-bot/0.1.0`, response 200 `text/csv`, sha256 `ae0745680f0e4c3a84f714cd65bced3ff30643776dc6255492d8415669e720f1`.
- Quote convention for CSV sources: „<column header>: <cell value>“ (here „Whois Privacy: 4.19“), because a CSV cell has no running text.
- Value „4.19“ for .app, .berlin, .biz, .ch, .cloud, .co, .com, .dev, .info, .io, .me, .net, .online, .org, .shop and .xyz; „0.00“ for .de, .eu and .at (not offered, see the row above).
- Net: the CSV column „Verlängerung“ equals `price.renewal` of all 16 offers (e.g. .com 15.50 = 1550 cents), so the CSV has the same VAT mode as the offers (`vat_included: false`). `price_cents` 419, `unit` year.

.ai (chnet/tldcost#28): the adapter skips .ai because the API gives a period of 2 years. The offer is entered by hand (`method: manual`, `confidence: medium`, no `evidence_hash`).
- Price, read by hand on 2026-11-24 at 07:37–07:38 UTC: the owner searched an invented .ai name in the [domain check](https://www.inwx.de/de/domain/check) in a normal browser, not logged in, and opened the cart without a checkout. Cart: „Laufzeit: 24 Monate 238,00 € / 2 Jahre“, „19% MwSt.: 38,00 €“. Result row: „119,00 € / 1 Jahr“ as the price and again as the renewal („Verlängerung“). So the 2-year registration costs 238,00 € gross = 200,00 € net, and „119,00 € / 1 Jahr“ is the per-year display. It does not state the renewal term.
- Term, from the API: one static request to https://www.inwx.de/api/v1/domain/all-prices on 2026-11-24T07:44:38Z as `tldcost-bot`, response 200 `application/json`, sha256 `785a651a79830a9a0998dcdf84142c3dfad805d0d57c2b60b890f12206b93d9b`. The .ai row: `"createPrice": 100, "transferPrice": 100, "renewalPrice": 100, … "createPeriod": 2, "transferPeriod": 2, "renewalPeriod": 2, "restorePeriod": 2, "vat": 0`. The price is net per year; registration and renewal are each for 2 years.
- Data (net, `vat_included: false` like all INWX offers): `year1` 200,00 € with `term_years: 2`, `renewal` 200,00 € with `renewal_term_years: 2` (the term from `renewalPeriod`). Transfer was not checked: `transfer_in: null`. `transfer_out: 0` as for all INWX offers (domain contract Nr. 3).
- No `features`: the whois privacy quote above covers 16 other TLDs, not .ai.

## IONOS (`ionos`)

- Operator: IONOS SE, Elgendorfer Str. 57, 56410 Montabaur, Germany; Amtsgericht Montabaur HRB 24498 ([Impressum](https://www.ionos.de/impressum), retrieved 2026-11-12)
- Price list: https://www.ionos.de/domains/domain-preistabelle (columns: Limitiertes Angebot, Domain-Bundle-Preis, Willkommensangebot, Reguläre Verlängerungsgebühr, Domain-Umzug, Reaktivierungsgebühr, ICANN-Gebühr)
- AGB: https://www.ionos.de/terms-gtc/terms/ – **ROBOTS-DISALLOWED** (`Disallow: /terms-` in https://www.ionos.de/robots.txt). Not fetched, version unknown. This also applies to the payment terms (https://www.ionos.de/terms-gtc/terms-payment/) and all PDFs under `/terms-gtc/`. No separate service description for domains was found (it would probably also be under `/terms-`).
- Price display: gross, footer: „Preise inkl. MwSt., Angebote sind nur für begrenzte Zeit gültig und sind teils abhängig von Mindestvertragslaufzeiten.“
- Notes:
  - Domain prices are shown as **monthly prices**, e.g. .de „0,08 €/Monat für 12 Monate“, struck through 1,30 €/month ([.de page](https://www.ionos.de/domains/de-domain)). The price table states no unit. However, the values match the .de page (monthly price).
  - There is a **promotional price in year 1**: „Die Angebotspreise gelten im ersten Jahr und sind im Voraus zahlbar.“ ([price table](https://www.ionos.de/domains/domain-preistabelle)). There are three promotional variants: „Limitiertes Angebot“, „Domain-Bundle-Preis“ and „Willkommensangebot“.
  - The help page explains a higher follow-up invoice like this: the „vergünstigte Preis für die ersten Monate“ has expired ([help](https://www.ionos.de/hilfe/domains/preise-und-rechnung/hoeherer-rechnungsbetrag-auf-neuester-rechnung/)).
  - Cancelling a domain does not end the associated contract: „Der zugehörige Vertrag bleibt nach einer Domain-Kündigung erhalten. Dadurch können nach der Kündigung weiterhin Kosten anfallen.“ ([help](https://www.ionos.de/hilfe/domains/laufzeiten-und-kuendigung/einzelne-domain-kuendigen/))
  - Each contract includes 1 SSL wildcard certificate (for 1 domain of the original contract), plus Domain Lock ([.de page](https://www.ionos.de/domains/de-domain)).
  - Reactivation fee 90 € (price table). Redemption: 10 days restore, then 20 days reactivation, 30 days in total (help page „Einzelne Domain kündigen“).
  - Multi-year registration (12 or 24 months) is only available for .de, .com, .info, .org, .eu and .net ([help](https://www.ionos.de/hilfe/domains/domain-bestellen-die-passende-domain-finden/domain-fuer-mehrere-jahre-bestellen/)).
- Orientation (.de / .com, price table, retrieved 2026-11-12, monthly prices gross):
  - .de: Limitiertes Angebot 0,50 €, bundle 0,08 €, Willkommensangebot 0,08 €, renewal 1,30 €, transfer 0,33 €
  - .com: Limitiertes Angebot 1 €, bundle –, Willkommensangebot 0,08 €, renewal 2 €, transfer 0,91 €

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| vat_display | gross | Footer: „Preise inkl. MwSt., Angebote sind nur für begrenzte Zeit gültig …“ | [Price table](https://www.ionos.de/domains/domain-preistabelle) | 2026-11-12 |
| min_term_months | 12 (optionally 24 for selected TLDs) | Help: „Sie können ausgewählte Domains bei IONOS wahlweise für 12 oder 24 Monate registrieren.“ AGB not accessible (robots). | [Help multi-year registration](https://www.ionos.de/hilfe/domains/domain-bestellen-die-passende-domain-finden/domain-fuer-mehrere-jahre-bestellen/) | 2026-11-12 |
| notice_period_days | 3 (72 hours, per help page) | Help: „Die Deaktivierung der automatischen Verlängerung ist bis zu 72 Stunden vor dem aktuellen Laufzeitende möglich.“ See conflict below. | [Help cancel a single domain](https://www.ionos.de/hilfe/domains/laufzeiten-und-kuendigung/einzelne-domain-kuendigen/) | 2026-11-12 |
| billing_cycle | unknown (price shown monthly; billing monthly to yearly in advance, depending on the contract) | Help: „Je nach gewähltem Vertrag werden die Gebühren monatlich, viertel-, halbjährlich oder jährlich im Voraus abgerechnet.“ Price table: promotional prices „im ersten Jahr … im Voraus zahlbar“. | [Help invoice](https://www.ionos.de/hilfe/mein-konto/die-ionos-rechnung/berechnung-ueber-das-kuendigungsdatum-hinaus/), [Price table](https://www.ionos.de/domains/domain-preistabelle) | 2026-11-12 |
| auto_renew_default | yes, by 1 year | Help: „…ist die automatische Verlängerung der Domain standardmäßig aktiviert. Damit verlängert sich Ihre Domain zum Ende der Laufzeit automatisch um ein weiteres Jahr.“ | [Help automatic renewal](https://www.ionos.de/hilfe/domains/laufzeiten-und-kuendigung/automatische-verlaengerung-einer-domain/) | 2026-11-12 |
| price_change_notice | unknown | AGB blocked by robots. No statement on the help pages checked. | – | 2026-11-12 |
| setup_fee | not shown (price table has no column for it); help: „In seltenen Fällen müssen wir zudem eine einmalige Einrichtungsgebühr berechnen.“ | Help „Was kostet ein Domain-Umzug?“ | [Help](https://www.ionos.de/hilfe/domains/preise-und-rechnung/was-kostet-ein-domain-umzug/) | 2026-11-12 |
| transfer_out | free; auth code can be retrieved in the account; transfer lock for gTLDs active by default; 60-day lock (ICANN) for .com/.net/.org and others | Help: „Domain von IONOS zu einem anderen Anbieter umziehen – kostenlos“. Transfer help: auth code via „Autorisierungscode anzeigen“. | [Help transfer costs](https://www.ionos.de/hilfe/domains/preise-und-rechnung/was-kostet-ein-domain-umzug/), [Help transfer away](https://www.ionos.de/hilfe/domains/domain-von-11-ionos-zu-einem-anderen-anbieter-umziehen/domain-von-11-ionos-zu-einem-anderen-anbieter-umziehen/) | 2026-11-12 |
| payment_methods | card, paypal, sepa (bank transfer only in exceptional cases) | Help lists „Kreditkarte“, „PayPal“, „SEPA-Lastschriftverfahren“. Bank transfer: „…nur in Ausnahmefällen möglich, da es sich um keine offizielle Zahlungsmethode bei IONOS handelt.“ | [Help direct debit](https://www.ionos.de/hilfe/mein-konto/zahlungsmethoden/lastschrift-konnte-nicht-eingeloest-werden/) | 2026-11-12 |
| ssl_free | free (1 wildcard per contract) | „kostenlosen enthaltenen SSL-Wildcard-Zertifikat. Anwendbar auf 1 Domain Ihres ursprünglichen Vertrags.“ | [.de page](https://www.ionos.de/domains/de-domain) | 2026-11-12 |
| forward_301 | unknown (type not stated) | Help offers „HTTP-Weiterleitung“ and „Frame-Weiterleitung“, without a status code | [Help forwarding](https://www.ionos.de/hilfe/domains/domain-weiterleitung-einrichten/domain-auf-eine-andere-domain-weiterleiten/) | 2026-11-12 |
| forward_302 | unknown | as above | as above | 2026-11-12 |
| dns_editor | yes | Help category „DNS-Einstellungen“; DNS records in the Control Center | [Help domains](https://www.ionos.de/hilfe/domains/) | 2026-11-12 |
| custom_ns | yes | Help „Eigene Nameserver für eine Domain verwenden“ („…zwei weitere externe Nameserver…“) | [Help](https://www.ionos.de/hilfe/domains/eigene-nameserver-nutzen/eigene-nameserver-fuer-eine-domain-verwenden/) | 2026-11-12 |
| dnssec | paid (only with Domain Guard; price unknown) | „Ein weiter Vorteil eines Domain Guard-Abonemments ist, dass Sie die DNS-Sicherheitserweiterung DNSSEC … nutzen können.“ Domain Guard is an „optionale Sicherheitserweiterung“. | [Help Domain Guard](https://www.ionos.de/hilfe/domains/domain-guard/was-ist-domain-guard-und-welche-vorteile-bietet-es/) | 2026-11-12 |
| email_forwarding | unknown | not documented for the domain-only product | – | 2026-11-12 |
| whois_privacy | none (discontinued for all TLDs); .de: n/a (registry, see Cross-cutting findings) | „…hat IONOS den Dienst „Whois Privacy” für alle Top-Level-Domains (TLDs) eingestellt.“ (NIS2, 06.12.2025) | [Help NIS2](https://www.ionos.de/hilfe/domains/domain-recht-und-eigentuemerschaft/aenderungen-bei-der-domain-privatsphaere-whois-privacy-durch-nis2/) | 2026-11-12 |
| api | unknown | https://developer.hosting.ionos.de/docs/getstarted is rendered client-side, no content readable | – | 2026-11-12 |
| two_factor | unknown | no help page on 2FA for the IONOS account found (web search only returned Cloud/Nextcloud) | – | 2026-11-12 |

Open items:
- **AGB blocked by robots** (`/terms-`). This is why the AGB clause and AGB quote are missing for min_term, notice, auto-renew and price_change. There is only help center evidence. According to a web search snippet (not fetched, not verified), AGB section 5.3 says: 12 months minimum term, then an indefinite period with 1 month notice. AGB sections 5.7 and 3.9 concern domains. This should be checked manually or with approval.
- **Notice period conflict**: according to the help page, it is enough to deactivate auto-renewal up to 72 h before the end of the term. According to the snippet, the AGB state 1 month (unverified). The AGB apply, but they are not accessible.
- Billing cycle of the domain-only product unclear: the prices are monthly prices, the promotional price applies to year 1 in advance.
- Price for Domain Guard (DNSSEC) not determined.
- The IONOS help URL `https://www.ionos.de/hilfe/index.php?id=2513` (provider change) aborted during retrieval (IncompleteRead) and was not evaluated.
- Checked: Impressum, .de page, price table, robots.txt, help center (domains, terms, transfer, forwarding, name servers, NIS2, Domain Guard, invoice, direct debit), developer portal.

Price data (Archiv-Issue 75, retrieved 2026-11-15, one request each as `tldcost-bot`):
- **Source: adapter `ionos` (owner decision 2026-11-27).** The [price table](https://www.ionos.de/domains/domain-preistabelle) is static HTML and allowed by [robots.txt](https://www.ionos.de/robots.txt). The AGB are under `/terms-`, which robots.txt disallows, so their rules on automated access cannot be checked. Until 2026-11-27 the rule was: ToS not checkable → manual (maintainer decision, 2026-11-15). Owner decision (2026-11-27): the price table is read automatically in the weekly data update, and the owner accepts the remaining AGB risk. Conditions: 2 request(s) per run as `tldcost-bot`, price table only; the adapter stops on any challenge, bot sensor or login page and never works around it (Methodik: „Keine Umgehung von Login oder Bot-Schutz.“). Offers: `method: scrape`, `confidence: medium`, `source_url` = price table, `evidence_hash` = sha256 of the fetched page.
- **Unit: month.** The table states no unit. The [.de page](https://www.ionos.de/domains/de-domain) shows the same values per month: „Sparen Sie 94% 1,30 € 0,08 € /Monat für 12 Monate“ (.de), likewise .com and .org.
- **year1:** the column „Willkommensangebot“ (the price the product pages show), else „Limitiertes Angebot“, else the regular price. The „Domain-Bundle-Preis“ needs another product and is ignored. Condition on the table: „Die Angebotspreise gelten im ersten Jahr und sind im Voraus zahlbar.“ Footer of the table, in full: „Preise inkl. MwSt., Angebote sind nur für begrenzte Zeit gültig und sind teils abhängig von Mindestvertragslaufzeiten.“ Both go into `promo.conditions`. The table does not say which TLDs have a minimum term. No end date (`valid_until: null`).
- **„Willkommensangebot“ and existing customers:** the name suggests an offer for new customers, but neither the price table nor the .de page says so (no „Neukund…“ on either). If it is for new customers only, existing customers pay the „Limitiertes Angebot“ in year 1 (e.g. .com 1 €, .net 1,25 € per month).
- **renewal:** „Reguläre Verlängerungsgebühr“. **year1_regular: `null` for the 18 promo offers:** Preistabelle nennt keinen regulären Erstjahrespreis (its columns are Limitiertes Angebot, Domain-Bundle-Preis, Willkommensangebot, Reguläre Verlängerungsgebühr, Domain-Umzug, Reaktivierungsgebühr, ICANN-Gebühr). The renewal fee is not taken as a first-year list price. Without a promo (.biz, .co), `year1_regular` = `year1`.
- **transfer_in: null.** The column „Domain-Umzug“ (.de 0,33 €) states no unit, and a transfer at IONOS includes a contract term, so a one-off amount would be a guess.
- **setup: 0.** The table lists every fee per TLD (renewal, transfer, reactivation 90 €, ICANN „enthalten“) and no setup fee (rule, maintainer decision 2026-11-15). Caveat, about transfers only: „In seltenen Fällen müssen wir zudem eine einmalige Einrichtungsgebühr berechnen.“ ([Help „Was kostet ein Domain-Umzug?“](https://www.ionos.de/hilfe/domains/preise-und-rechnung/was-kostet-ein-domain-umzug/)).
- **icann_fee_included:** `true` for gTLDs („ICANN-Gebühr: enthalten“), `null` for ccTLDs. Reason: an ICANN fee exists only for gTLDs; ccTLD registries (e.g. DENIC, SWITCH, nic.at, EURid) charge none. The table also shows „enthalten“ on ccTLD rows, but there it states nothing. The schema field is gTLD-only („null = unknown or not applicable“), and the other providers also use `null` for ccTLDs.
- **Not consistent on the provider's side:** the .de page lists .info at „4 € /Monat für 12 Monate“, the price table at 3,50 € regular with a limited offer of 0,17 €. The offers follow the price table.
- **Plausibility (Archiv-Issue 64):** `ionos/de` renewal 15,60 €/year is 3.22x the TLD median (4,85 €). Correct as stated: the .de page shows 1,30 €/month as the regular price.
- TLDs: the 20 TLDs of `data/offers/netcup/`, all sold by IONOS (the table lists 440 TLDs).

## netcup (`netcup`)

- Operator: netcup GmbH, Emmy-Noether-Straße 10, 76131 Karlsruhe, Germany; HRB 705547, AG Mannheim; VAT ID DE262851304 ([Impressum](https://www.netcup.com/de/kontakt/impressum), retrieved 2026-11-12)
- Price list: https://www.netcup.com/de/domain/domain-endungen (prices are loaded client-side via JS, the server HTML contains no prices); product pages per TLD, e.g. https://www.netcup.com/de/domain/zusaetzliche-domain-de and https://www.netcup.com/de/domain/zusaetzliche-domain-com (prices and contract data in the HTML); overview https://www.netcup.com/de/domain/domain-kaufen
- AGB: https://www.netcup.com/de/agb (version: no date and no version number on the page; the domain rules are in the section „Sondervorschriften für die Reservierung von Domains“. There is no separate service description for domains; the contract data is on the product pages under „Vertragliches“.)
- Price display: gross. Shown as „pro Monat (inkl. 19% MwSt.)“, country/VAT selector with default Germany 19 %. Footer: „Preis inkl. 19% USt.“
- Notes:
  - Prices are shown as a **monthly price** (e.g. .de „0,42 € pro Monat“), but billing is every **12 months** (product page „Abrechnungsperiode 12 Monate“). For the yearly price, multiply by 12.
  - netcup registers .de, .at, .ch, .li and .eu as its own registrar. All other TLDs go through EPAG Domainservices GmbH, Bonn. For these, their „Exhibit A“ also applies (AGB, Sondervorschriften Domains).
  - Domains can be ordered individually (without hosting). Included domains from web hosting packages are handled separately: they are cancelled together with the hosting contract.
  - New customers are subject to a CRIF credit check (AGB section 2).

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | netcup GmbH, Karlsruhe, DE | Impressum: „netcup GmbH, Emmy-Noether-Straße 10, D-76131 Karlsruhe“ | [Impressum](https://www.netcup.com/de/kontakt/impressum) | 2026-11-12 |
| price_page | https://www.netcup.com/de/domain/domain-endungen (JS) or product pages `zusaetzliche-domain-<tld>` | – | [Domain-Endungen](https://www.netcup.com/de/domain/domain-endungen) | 2026-11-12 |
| terms | AGB netcup GmbH, without date/version; annex „Sondervorschriften für die Reservierung von Domains“; for EPAG TLDs also EPAG Exhibit A (https://www.epag.de/downloads/exhibit-a.htm, not fetched) | AGB Sondervorschriften Domains: „Mit Registrierungsauftrag akzeptiert der Kunde neben den AGB der netcup GmbH den Exhibit A der EPAG Domainservices GmbH“ | [AGB](https://www.netcup.com/de/agb) | 2026-11-12 |
| vat_display | gross (incl. 19 % VAT, default country DE) | Product page: „0,42 € pro Monat (inkl. 19% MwSt.)“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de) | 2026-11-12 |
| min_term_months | 12 | Product page „Vertragliches“: „Mindestvertragslaufzeit 12 Monate“ (same for .com, .net, .eu) | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de), [Domain .com](https://www.netcup.com/de/domain/zusaetzliche-domain-com) | 2026-11-12 |
| notice_period_days | 30 (AGB: „1 Monat zum Monatsende“). The help center, by contrast, states „mindestens 31 Tage“ before expiry, see conflict | AGB section 6 para. 1: „Solche Verträge sind von beiden Parteien mit einer Frist von einem Monat zum Monatsende kündbar, frühestens jedoch zum Ablauf einer vertraglich vereinbarten Mindestlaufzeit.“ | [AGB](https://www.netcup.com/de/agb) | 2026-11-12 |
| notice_period_days (help center) | 31 | Help center domain termination: „In jedem Fall dauert es mindestens 31 Tage vor Ablauf der Mindestvertragslaufzeit, bis die Kündigung abgeschlossen ist.“ (as of 2 March 2026) | [Help center domain termination/transfer](https://www.netcup.com/de/helpcenter/dokumentation/domain/domain-kuendigung) | 2026-11-12 |
| billing_cycle | yearly (12 months in advance), shown as monthly price | Product page: „Abrechnungsperiode 12 Monate“. AGB section 4 para. 1: „nutzungsunabhängige Entgelte im Voraus für die in der Leistungsbeschreibung genannte Abrechnungsperiode zu zahlen“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de), [AGB](https://www.netcup.com/de/agb) | 2026-11-12 |
| auto_renew_default | yes (contract for an indefinite period, continues until terminated) | AGB section 6 para. 1: „Soweit nicht anders vereinbart, werden Verträge auf unbestimmte Zeit geschlossen.“ | [AGB](https://www.netcup.com/de/agb) | 2026-11-12 |
| price_change_notice | yes: 6 weeks notice for the start of a new billing period, special termination right. Without termination within 4 weeks, the change counts as approved | AGB section 4 para. 7: „die Preise zu Beginn eines neuen Abrechnungszeitraums mit einer Änderungsfrist von sechs Wochen zu ändern. Der Kunde ist zur außerordentlichen Kündigung … berechtigt.“ | [AGB](https://www.netcup.com/de/agb) | 2026-11-12 |
| setup_fee | 0,00 € | Product page: „Einrichtungsgebühr 0,00 € (inkl. 19% MwSt.)“. AGB Sondervorschriften Domains: a processing fee applies „sofern in der Angebotsbeschreibung genannt“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de) | 2026-11-12 |
| transfer_out | Request the auth code yourself in the CCP (valid 30 days). No fee is stated. The auth code can only be requested until the termination date. | Help center: „Der Auth-Code ist für 30 Tage ab Ausstellung gültig.“ / „Nach Ablauf des Kündigungstermins kann kein Auth-Code mehr angefordert werden“ | [Help center domain termination/transfer](https://www.netcup.com/de/helpcenter/dokumentation/domain/domain-kuendigung) | 2026-11-12 |
| payment_methods | sepa, invoice (bank transfer), paypal, card (Visa, Mastercard, Diners/Discover, Amex) | Help center: „Manuelle Zahlung: Banküberweisung, PayPal Automatische Zahlung: Kreditkarte, SEPA-Lastschrift“ | [Help center payment options](https://www.netcup.com/de/helpcenter/dokumentation/general/zahlungsmoeglichkeiten) | 2026-11-12 |
| ssl_free | n/a for domain-only. Let's Encrypt is only available with web hosting. | Help center navigation lists „SSL-Verschlüsselung mit Let's Encrypt“ only under web hosting | [Help center domain FAQ](https://www.netcup.com/de/helpcenter/dokumentation/domain/faq) | 2026-11-12 |
| forward_301 | only with web hosting (setting „Hosting-Typ“ in the web hosting plan). Unknown for domain-only. | Help center: „301 Dauerhaft verschoben: dauerhafte Weiterleitung auf eine neue URL.“ (under web hosting) | [Help center domain forwarding](https://www.netcup.com/de/helpcenter/dokumentation/webhosting/domain-weiterleitung) | 2026-11-12 |
| forward_302 | only with web hosting (see above). According to the help center, HTTPS forwarding only via .htaccess/index.html. | Help center: „302 Temporär verschoben: Weiterleitung auf eine andere URL …“ | [Help center domain forwarding](https://www.netcup.com/de/helpcenter/dokumentation/webhosting/domain-weiterleitung) | 2026-11-12 |
| dns_editor | free (included) | Product page: „DNS Einstellungen verwaltbar Ja“, records „A, AAAA, MX, CNAME, TXT, SRV“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de) | 2026-11-12 |
| custom_ns | free (included) | Product page: „Eintragung von eigenen Nameservern Ja“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de) | 2026-11-12 |
| dnssec | yes (CloudDNS and external name servers, TLD-dependent) | Help center: „Erfahre, wie du die DNSSEC aktivierst und welche Top-Level-Domains unterstützt werden.“ | [Help center DNSSEC](https://www.netcup.com/de/helpcenter/dokumentation/domain/dnssec-cloud-dns) | 2026-11-12 |
| email_forwarding | only with web hosting (help center „E-Mail-Weiterleitung einrichten“ under web hosting). Unknown for domain-only. | Help center navigation (Webhosting > E-Mail) | [Help center domain FAQ](https://www.netcup.com/de/helpcenter/dokumentation/domain/faq) | 2026-11-12 |
| whois_privacy | unknown | checked: AGB, product pages .de/.com, help center domain FAQ/ordering/termination; no mention | – | 2026-11-12 |
| api | yes (netcup API/CCP API for CloudDNS domains, API key in the CCP) | Help center: „Die APIs im Customer Control Panel (CCP) erlauben es dir, programmatisch verschiedene Aktionen durchzuführen.“ | [Help center netcup API](https://www.netcup.com/de/helpcenter/dokumentation/domain/netcup-api) | 2026-11-12 |
| two_factor | yes (TOTP, CCP) | Help center: „Dein Customer Control Panel (CCP) ist ebenfalls durch 2FA geschützt“ | [Help center 2FA](https://www.netcup.com/de/helpcenter/dokumentation/general/mfa) | 2026-11-12 |
| sample .de | 0,42 €/month gross (= 5,04 €/year), billed for 12 months. Whether this is a promotional or permanent price is not stated. | Product page: „0,42 € pro Monat (inkl. 19% MwSt.)“ | [Domain .de](https://www.netcup.com/de/domain/zusaetzliche-domain-de) | 2026-11-12 |
| sample .com | 1,38 €/month gross (= 16,56 €/year). On the domain purchase page as „ab 1,38 €“. | Product page: „1,38 € pro Monat (inkl. 19% MwSt.)“ | [Domain .com](https://www.netcup.com/de/domain/zusaetzliche-domain-com) | 2026-11-12 |

Open items:
- **Notice period conflict:** the AGB (section 6 para. 1) state „ein Monat zum Monatsende, frühestens zum Ablauf der Mindestlaufzeit“. The help center states „mindestens 31 Tage vor Ablauf der Mindestvertragslaufzeit“. The AGB take precedence; both statements are recorded above.
- **Term after the minimum term unclear:** the AGB speak of „unbestimmter Zeit“, terminable monthly after the minimum term. The product page states a billing period of 12 months. It is unclear whether, after the first 12 months, the contract can be terminated monthly (with a refund) or only at the end of each 12-month period. AGB section 6 para. 2 (renewal by 12 months) only concerns contracts with a 24-month term.
- The AGB have no version date. If needed, version them via Wayback/diff.
- The price list (domain-endungen) is loaded via JS. For the scraper, product pages per TLD or a JSON endpoint would have to be found; not searched for, because it is outside the scope of the task.
- Whether there are renewal or promotional prices for year 1 is not stated. The product page only shows one price.
- Forwarding and e-mail forwarding are only documented for web hosting. Whether forwarding via DNS/CloudDNS exists for a domain-only product is unknown.
- Not fetched: EPAG Exhibit A (different host). Check separately if needed.

## one.com (`one-com`)

- Operator: One.com Group AB, Carlsgatan 3, 211 20 Malmö, **Sweden**. Trade register 559205-2400, VAT ID SE559205240001. ([Impressum](https://www.one.com/de-de/legal/impressum/), page date 13 Aug. 2026, retrieved 2026-11-12. The page shows the address run together as „Carlsgatan 3211 20 Malmö“.)
- Price list: https://www.one.com/de/domains/preise („Domainpreise in EUR“, columns registration / transfer / renewal / redemption)
- AGB: https://www.one.com/de-de/legal/agb/ („v.17 In Kraft ab 9. April 2024“, page date 3 Nov. 2025). In addition, the domain expiry policy applies: https://www.one.com/de-de/legal/domain-ablauf/ (23 Aug. 2024). There is no separate service description for domains.
- Price display: gross, „Alle Preise inkl. 19% MwSt.“ (price list, German country version).
- Notes:
  - A domain without hosting is possible. Domains FAQ: „Ja, du kannst problemlos eine Domain kaufen, ohne ein Hosting‑Paket dazu zu buchen.“ When buying, you choose „Nur Domainregistrierung oder Domain plus Webhosting“.
  - However, the [Pakete & Preise](https://www.one.com/de-de/pakete-preise/) page does not list a separate domain-only package with a price.
  - The AGB are tailored to „Hosting-/Webspace-Abonnements“: a domain name „kann … Teil des Leistungsumfangs sein“ (AGB section 1). Separate term and termination rules for the domain-only contract are missing. The general subscription rules (sections 1, 1.6, 4.5) are assumed here.
  - The price list shows „Gratis mit Hosting“ for many TLDs. The registration price includes „die Jahresgebühr für das erste Vertragsjahr“.
  - **Year 1 conflict:** the Domains page says „Bei allen Paketen ist deine Domain im ersten Jahr kostenlos“. However, the price list states 0,90 € for .de and 4,17 € for .com as the registration price without hosting.
  - Promotional prices only apply to the first contract period (price list: „Sonderangebote gelten nur für den ersten Vertragszeitraum“).
  - one.com acts as an intermediary. Registration is handled by „Partner von one.com“ (registrars or registries); these are not named (AGB section 2).
  - Operator based in another EU country (Sweden). Place of jurisdiction and applicable law were not evaluated.
- **Price source (Archiv-Issue 75, checked 2026-11-15):** scraper adapter `scraper/src/adapters/one-com.ts`, one request per run to the price list.
  - [robots.txt](https://www.one.com/robots.txt) (retrieved 2026-11-15) disallows only `/admin/`, `/maintenance/`, `/*.do$` and the order paths (`/de/bestellung`, …). `/de/domains/preise` is allowed.
  - AGB v.17 (retrieved 2026-11-15): no clause on automated access to the website (the AGB cover the customer contract only).
  - The price list is static HTML (no JavaScript needed), gross („Alle Preise inkl. 19% MwSt.“), German notation.
  - Country detection (checked 2026-11-19): the page shows the prices for the visitor's country, detected on the server from the IP address. The inline `onecomConfig` names it (`countryCode = 'DE'`, `showVAT = 'true'`, `vatPercentage = '19'`); the English page `/en/domain/prices` from a German address also says `countryCode = 'DE'` and „All prices include 19% VAT“. There is no public country or VAT selection. The adapter requires these three settings and the gross note; any other display fails the provider, and the error names the settings and the note the page showed. The scheduled update runs on GitHub-hosted runners; their runs of 2026-11-16 and 2026-11-19 got a page without the gross note. The run of 2026-11-19 named the display: `countryCode "US"`, `showVAT "false"`, `vatPercentage "0"`, no VAT note.
  - US display (owner decision 2026-11-19, „Fremdmarkt“ in docs/decisions.md): the adapter has a separate branch for exactly that display. It also requires `onecomConfig.currency` USD and the heading „Domainpreise in USD“, and no VAT statement in the notices under the table. The prices are recorded as quoted, in USD and net, with `foreign_market` (heading and row verbatim as the quote); the site converts them at the ECB rate and adds 19 %. A US display in EUR or another currency throws (no decision for it). A dry run on a runner (2026-11-19) got past all display checks and showed the amounts in US notation („38.99“); the US branch reads them strictly (`usdCents`, decimal point, optional `$` or `USD`), the German branch keeps the German notation. The run log names the display (country, currency, heading, first row) before anything is parsed. The US page could not be seen from a German address; its test page is synthetic (built in `scraper/test/one-com.test.ts` from the German fixture under the US settings) until a run on a runner shows the real page.
  - Unit: per year. Column tooltip: „Die Registrierungs- und Umzugsgebühren beinhalten die Jahresgebühr für das erste Vertragsjahr.“ AGB section 2: „jährliche Domaingebühr“.
  - year1 = the current price without hosting, year1_regular = the struck-through standard price, renewal = column „Erneuerung“, transfer_in = column „Umzug“ (includes the first year). Promo condition quoted verbatim: „Sonderangebote gelten nur für den ersten Vertragszeitraum.“ No end date stated (`valid_until` null). The badge „Gratis mit Hosting“ needs a hosting package (bundle) and is ignored.
  - Setup: the price list names no setup fee; `setup: 0` as for the other registrars' price lists.
  - Not offered: .dev, .app. Left out: .ai (2-year minimum at the registry; the list does not say whether 193,08 € is per year or per term).
  - Plausibility (Archiv-Issue 64): .de renewal 17,99 €/year is 3.71× the median of the other providers. It is the stated price (column „Erneuerung“, per year), not a unit error.
- Orientation (not seed, gross, [price list](https://www.one.com/de/domains/preise), retrieved 2026-11-12):
  - .de: registration (year 1) 0,90 €, renewal 17,99 €/year, free with hosting
  - .com: registration (year 1) 4,17 €, renewal 28,80 €/year, redemption 59,50 €, free with hosting

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | One.com Group AB, Malmö, SE | Impressum: „Anbieter: One.com Group AB … Malmö Schweden … Handelsregister: 559205-2400“ | [Impressum](https://www.one.com/de-de/legal/impressum/) | 2026-11-12 |
| price_page | https://www.one.com/de/domains/preise | „Domainpreise in EUR“; AGB 2.3 refers to this URL | [Price list](https://www.one.com/de/domains/preise), [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| terms | AGB v.17, in force from 09.04.2024 | AGB: „v.17In Kraft ab 9. April 2024“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| vat_display | gross (incl. 19 % VAT) | Price list: „Alle Preise inkl. 19% MwSt.“ | [Price list](https://www.one.com/de/domains/preise) | 2026-11-12 |
| min_term_months | 12 | AGB section 1: „Die Abonnementsperiode dauert 12 Monate.“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| notice_period_days | 30 | AGB 1.6: „muss die Kündigung spätestens 30 Tage vor Vertragsjahresende bei one.com eingehen“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| billing_cycle | yearly in advance | AGB 4.5: „Webspace-Abonnements werden – ungeachtet des Abonnementstyps – 12 Monate im Voraus gezahlt.“ AGB section 2: „Zum Ende jeder Abonnementsperiode erhält die Kundschaft eine Rechnung … über die jährliche Domaingebühr“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| auto_renew_default | yes (automatic renewal 30 days before the end of the period) | AGB section 1: „30 Tage vor Ende einer 12-monatigen Abonnementsperiode wird das Abonnement automatisch verlängert“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| price_change_notice | yes: 45 days advance notice. An explicit special termination right is only stated for „erheblichen Änderungen“ of the AGB (1 month notice). | AGB 4.10: „Die Verkaufs- und Lieferbedingungen von one.com, sowie die Preise, können mit einer Vorankündigung von 45 Tagen geändert werden.“; AGB 1.6: „ist der Kunde dazu berechtigt, das Abonnement unter Einhaltung einer einmonatigen Kündigungsfrist zu kündigen“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| setup_fee | none separately (registration price includes year 1; the AGB mention a non-refundable „Bereitstellungsgebühr“ for incorrect orders) | Price list: „Die Registrierungs- und Umzugsgebühren beinhalten die Jahresgebühr für das erste Vertragsjahr.“ | [Price list](https://www.one.com/de/domains/preise), [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| transfer_out | unknown (fee and procedure not publicly documented). No transfer is possible during the 30-day redemption period. | Domain-Ablauf: „Während dieser Periode sind die DNS der Domain deaktiviert, und ein Transfer ist nicht möglich.“ | [Domain-Ablauf](https://www.one.com/de-de/legal/domain-ablauf/) | 2026-11-12 |
| payment_methods | card (Dankort/Eurocard/MasterCard/VISA/JCB), paypal (stated for add-ons). SEPA not stated. | AGB 4.6: „Online-Zahlungen mit Dankort, Eurocard, MasterCard, VISA, VISA Electron oder JCB“; AGB 3.2: „mit Kreditkarte, über PayPal oder mit einer anderen Echtzeit-Zahlungsmethode“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| ssl_free | unknown for domain-only | Domains page only lists SSL as a product | [Domains](https://www.one.com/de-de/domains/) | 2026-11-12 |
| forward_301 / forward_302 | forwarding yes, status code unknown | Domains: „Richte ganz einfach individuelle Weiterleitungen und Aliase für deine Domain ein.“ | [Domains](https://www.one.com/de-de/domains/) | 2026-11-12 |
| dns_editor | yes, free | .de page: „Kostenloser DNS-Service – Kostenloses DNS-Management für maximale Kontrolle.“ | [.de domain](https://www.one.com/de-de/domains/de/) | 2026-11-12 |
| custom_ns | unknown (indirectly: the AGB mention domains that point „auf die DNS-Server anderer Server“) | AGB section 2: „unabhängig davon, ob die Domain auf die DNS-Server von one.com oder auf die DNS-Server anderer Server zeigt“ | [AGB](https://www.one.com/de-de/legal/agb/) | 2026-11-12 |
| dnssec | unknown | not mentioned | – | 2026-11-12 |
| email_forwarding | unknown for domain-only (e-mail only with an e-mail/hosting package according to a help search result, help page 403) | – | – | 2026-11-12 |
| whois_privacy | unknown | not mentioned | – | 2026-11-12 |
| api | unknown | not mentioned | – | 2026-11-12 |
| two_factor | unknown (help center blocked) | – | – | 2026-11-12 |

Open items:
- Costs and conditions of the domain-only package cannot be documented without checkout. The contradiction „im ersten Jahr kostenlos“ (Domains page) vs. 0,90 €/4,17 € (price list) is also open.
- Do the subscription term and the 30-day notice period from the AGB apply to domain-only products? The AGB are worded for web space subscriptions; the assumption is reasonable, but not explicitly documented.
- Domain protection/Domain Lock is „in jedem Hosting‑Paket bereits enthalten“. For domain-only it is an add-on (AGB 3.9), price not collected.
- **Blocked:** help.one.com (help center) responds to the helper with HTTP 403. Not bypassed. Affected: https://help.one.com/hc/de/articles/360005628857 and https://help.one.com/hc/de/articles/18406791875217.
- Checked: /de/ (redirects to /de-de/), /de-de/legal/impressum/, /de/domains/preise, /de-de/domains/, /de-de/domains/de/, /de-de/domains/domainumzug/, /de-de/pakete-preise/, /de-de/legal/agb/, /de-de/legal/domain-ablauf/.

## STRATO (`strato`)

- Operator: STRATO GmbH, Otto-Ostrowski-Straße 7, 10249 Berlin, Germany; Berlin-Charlottenburg HRB 270570 B. Part of United Internet AG, like IONOS ([Impressum](https://www.strato.de/impressum/), retrieved 2026-11-12)
- Price list: https://www.strato.de/domains/domain-kosten/ (table „Beliebte Domainendungen“ with monthly promotional price in year 1, monthly standard price, one-time setup). A full list of all TLDs was not found („Alle TLDs entdecken“ leads to the domain check).
- AGB: https://www.strato.de/agb/ (version 17.90, as of: 19.06.2026). Domain terms: https://www.strato.de/_assets/pdf/de/Domainbedingungen.pdf (version 1.0, without date). For .com/.net there is also https://www.strato.de/_assets/pdf/de/besondere_bedingungen_com_net.pdf (not evaluated).
- Price display: gross („Preise inkl. MwSt.“)
- Notes:
  - The domain is sold as a **package with an e-mail address** („.de-Domain inkl. E-Mail-Adresse“, according to domain-kosten 2 GB e-mail storage).
  - **Monthly prices with a promotional price for 12 months**, then the standard price. When ordering, you choose the billing period „1 Monat“ or „12 Monate“ ([domain-kaufen](https://www.strato.de/domains/domain-kaufen/)). The prices of the 1-month variant are rendered client-side and were not collected.
  - Domainbedingungen 1.1 call STRATO „Registrar bzw. Reseller“. Depending on the TLD, the contract is concluded with STRATO or directly with the registry.
  - **After expiry without renewal** (Domainbedingungen 7.2–7.6): STRATO changes the name servers and may display its own content. From day 11 of the Auto-Renew Grace Period, ownership passes to the registrar. Days 11–30: restore for 90 €. After that only at the „vom Registrar geschätzten aktuellen Preis“. In the RGP it costs renewal plus 90 €.
  - Paper invoice 2,50 € per invoice (AGB 4.4).
  - The AuthInfo code is only available **after termination** (FAQ, see transfer_out).
- Orientation (domain-kosten, retrieved 2026-11-12, monthly prices gross):
  - .de: promotion 0,05 €/mo. (12 months), then 1,00 €/mo., setup 0 €
  - .com: promotion 0,60 €/mo. (12 months), then 1,80 €/mo., setup 0 €

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| vat_display | gross | „Preise inkl. MwSt.“ | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| min_term_months | 1 or 12 (selectable) | Domain comparison: „Bei STRATO wählen Sie zwischen einer Mindestvertragslaufzeit von einem Monat und einer Vertragslaufzeit von 12 Monaten.“ AGB 9.1 refers to the „erste Vertragslaufzeit“ as per offer. | [domain-vergleich](https://www.strato.de/domains/domain-vergleich/), [AGB](https://www.strato.de/agb/) | 2026-11-12 |
| notice_period_days | 30 („1 Monat“) | AGB 9.1: „…ist der Vertrag kündbar mit einer Frist von einem Monat zum Ende der ersten Vertragslaufzeit.“ | [AGB](https://www.strato.de/agb/) | 2026-11-12 |
| billing_cycle | monthly or yearly (depending on the selected billing period), in advance | AGB 4.2: „Nutzungsunabhängige Entgelte sind für die erste Vertragslaufzeit im Voraus zahlbar…“ Order page: „Abrechnungszeitraum wählen 1 Monat / 12 Monate“ | [AGB](https://www.strato.de/agb/), [domain-kaufen](https://www.strato.de/domains/domain-kaufen/) | 2026-11-12 |
| auto_renew_default | yes | Domainbedingungen 7.1: „Mangels fristgerechter Kündigung verlängert sich jede Domain automatisch um ein weiteres Jahr.“ AGB 9.1: „Danach verlängert er sich auf unbestimmte Zeit…“ (see conflict) | [Domainbedingungen](https://www.strato.de/_assets/pdf/de/Domainbedingungen.pdf), [AGB](https://www.strato.de/agb/) | 2026-11-12 |
| price_change_notice | yes: 4 weeks in advance in text form, special termination right, max. once per year | AGB 4.5.6: „…spätestens 4 Wochen vor dem geplanten Wirksamwerden in Textform mitteilen. Im Fall einer Preisänderung hat der Kunde das Recht, den Vertrag … zu kündigen.“ | [AGB](https://www.strato.de/agb/) | 2026-11-12 |
| setup_fee | 0 € for .de/.com; 2,50 € for some TLDs (e.g. .online, .blog, .tech, .store, .site, .digital) | Table „Einrichtung (einmalig)“ | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| transfer_out | AuthInfo only after termination with „Providerwechsel“. Automatic sending at the earliest 30 days before the termination date, manual request possible. Fee unknown. | FAQ: „Bei aktiven Domains ohne Kündigung können Sie keinen AuthInfo-Code anfordern.“ Domainbedingungen 6.1: registrar change „frühestens 60 Tage nach der Registrierung möglich“ | [FAQ AuthInfo](https://www.strato.de/faq/domains/authinfo-code/), [Domainbedingungen](https://www.strato.de/_assets/pdf/de/Domainbedingungen.pdf) | 2026-11-12 |
| payment_methods | sepa, paypal, card | AGB 4.1: „Die Zahlung kann durch SEPA-Lastschrifteinzug, Paypal oder Kreditkarte erfolgen.“ | [AGB](https://www.strato.de/agb/) | 2026-11-12 |
| ssl_free | free | FAQ: „Bei STRATO ist dieses Zertifikat für Ihre Domain inklusive und kann in Ihrem Login aktiviert werden.“ | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| forward_301 | unknown (forwarding free, type not stated) | „Die Einrichtung einer Domain-Weiterleitung … ist bei STRATO kostenlos…“ | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| forward_302 | unknown | as above | as above | 2026-11-12 |
| dns_editor | yes (free) | „…vollen Zugriff auf die DNS-Einstellungen … (NS-Record, A-Record, AAAA-Record, MX-Record, TXT-Record, SRV-Record und CName-Record…)“. DynDNS included. | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| custom_ns | unknown | The FAQ mentions NS records in the DNS settings. Delegation to external name servers is not explicitly documented. | [domain-kosten](https://www.strato.de/domains/domain-kosten/) | 2026-11-12 |
| dnssec | paid (Domain Guard 1,25 €/month, 12-month term) | „Sie erhalten den Domain Guard für 1,25 €/Monat bei einer Vertragslaufzeit von 12 Monaten.“ (incl. DNSSEC) | [Domain Guard](https://www.strato.de/domains/domainguard/) | 2026-11-12 |
| email_forwarding | unknown (e-mail address incl. mailbox in the package; forwarding not documented) | „.de-Domain inkl. E-Mail-Adresse“ | [.de page](https://www.strato.de/domains/de-domain/) | 2026-11-12 |
| whois_privacy | unknown | not checked. Domainbedingungen 6.1 mention „Die private Registrierung (sofern zutreffend) muss entfernt werden.“ | [Domainbedingungen](https://www.strato.de/_assets/pdf/de/Domainbedingungen.pdf) | 2026-11-12 |
| api | unknown | not found | – | 2026-11-12 |
| two_factor | yes (customer login, authenticator app) | „Um den Zugriff auf Ihren STRATO Kunden-Login … zu schützen, empfehlen wir die Zwei-Faktor-Authentifizierung (2FA).“ | [FAQ 2FA](https://www.strato.de/faq/sicherheit/was-ist-die-zwei-faktor-authentifizierung-2fa-und-warum-sollte-ich-sie-nutzen/) | 2026-11-12 |

Open items:
- **Renewal conflict**:
  - Domainbedingungen 7.1: renewal each time „um ein weiteres Jahr“.
  - AGB 9.1: after the first term „auf unbestimmte Zeit“, terminable at any time with 1 month notice.
  - FAQ: termination 1 month „vor Ablauf der Vertragslaufzeit“, „später eingehende Kündigungen würden erst nach einer weiteren Vertragslaufzeit wirksam“ ([FAQ deadlines](https://www.strato.de/faq/vertrag/gibt-es-fristen-fuer-die-vertragsbeendigung/)).
  - AGB 1.3 declares the domain terms to apply in addition. Which rule applies to domains remains open.
- Prices of the 1-month variant and the full price list of all TLDs were not collected (rendered client-side).
- The special terms for .com/.net (PDF) were not evaluated.
- Checked: robots.txt (no relevant blocks), Impressum, AGB, Domainbedingungen PDF, domain-kosten, domain-kaufen, .de page, domain-vergleich, Domain Guard, domainverwaltung, FAQ (deadlines, termination, AuthInfo, provider change, 2FA).

Price data (Archiv-Issue 75, retrieved 2026-11-15 as `tldcost-bot`):
- **Bundling rule (domains only with another contract): not affected.** Domains are sold stand-alone; hosting is optional: „Sobald sie im Warenkorb ist, können Sie die ausgewählte Domain kaufen. Optional kombinieren Sie Ihre neue Domain auch mit einer der STRATO Website-Lösungen, wie beispielsweise einem Homepage-Baukasten-, Hosting- oder Shop-Paket.“ ([domain-kaufen](https://www.strato.de/domains/domain-kaufen/)). The e-mail address in the domain package is part of the same contract, not a second one.
- **Source: adapter `strato` (`scraper/src/adapters/strato.ts`).** One server-rendered product page per TLD (`https://www.strato.de/domains/<tld>-domain/`) with a price card at the top. [robots.txt](https://www.strato.de/robots.txt) only disallows `/apps/` and `/error/`. The [AGB](https://www.strato.de/agb/) (17.90) say nothing about automated access to the website. No bot protection, no cookies needed. A run sends 22 requests (robots.txt, domain-kosten, 20 TLD pages).
- **Billing period: 12 months.** The card's order code is `STRATO_DOMAIN_<TLD>[_AKTION]_VLZ12`. The order page also offers „1 Monat“, at higher prices and with a setup fee of 10–30 € (e.g. .de 1,40 €/month, setup 10 €); not collected. Offers: `unit: month` as shown, gross („Preise inkl. MwSt.“), `contract.min_term_months: 12`, `contract.billing_cycle: yearly` (AGB 4.2: „Nutzungsunabhängige Entgelte sind für die erste Vertragslaufzeit im Voraus zahlbar“).
- **year1:** the card price. With „für 12 Monate“ / „12 Monate nur“ and „danach X € /Mon.“ the later price is `renewal`. The card names no regular first-year price, so `year1_regular` is `null` during a promo (without a promo it equals `year1`). The `_AKTION` suffix is not reliable (.xyz, .berlin and .cloud show a first-year price without it), so the adapter ignores it. Promo condition, verbatim from the FAQ of [domain-kosten](https://www.strato.de/domains/domain-kosten/): „Der Aktionspreis ist ein reduzierter Angebotspreis, der Ihnen als Neukunde meistens für die ersten 12 Monate gewährt wird.“ `promo.conditions` = the card term plus that sentence, e.g. „Aktionspreis „für 12 Monate“ laut Preiskarte. Der Aktionspreis ist …“. Without that sentence the adapter fails first-year prices closed. No end date (`valid_until: null`).
- **Unit check:** the card price must carry „/Mon.“; a card without it or with another unit (e.g. „/Jahr“) fails the TLD, so a yearly price can never be stored as monthly.
- **setup:** „Einrichtung“ on the card: 2,50 € for .online, .berlin, .xyz and .cloud, else 0 €. Since 2026-11-19 also 2,50 € for .ch: „3,90 € /Mon. Einrichtung: 2,50 €“ (card `STRATO_DOMAIN_CH_VLZ12` on [.ch](https://www.strato.de/domains/ch-domain/), retrieved 2026-11-19; the gate held the step from 0, set by hand after this check).
- **transfer_in / transfer_out / icann_fee_included: null** (not on the pages; AuthInfo fee unknown, see the table above).
- **Features:** from the table above (SSL free, DNS editor, 2FA, SEPA/PayPal/card). DNSSEC is `"paid"` with `feature_costs` (Archiv-Issue 124): it is only part of the paid Domain Guard (1,25 €/month).
- Cross-check: all 10 TLDs of the domain-kosten table that are MVP TLDs (.de, .eu, .com, .shop, .online, .org, .net, .info, .me, .ai) match the TLD pages.
- TLDs: all 20 MVP TLDs. .ch has no first-year price (3,90 €/month). Plausibility (Archiv-Issue 64): no STRATO hit.

## united-domains (`united-domains`)

- Operator: united-domains GmbH, Gautinger Straße 10, 82319 Starnberg, Germany; HRB 29 43 48, Amtsgericht München; VAT ID DE203066334; part of IONOS Group SE ([Kontakt / Impressum](https://www.united-domains.de/unternehmen/kontakt/), retrieved 2026-11-12)
- Price list: https://www.united-domains.de/domain-registrieren/preisliste/ (static HTML with all TLDs, domain services and add-on products, promotion footnotes with follow-up prices)
- AGB: https://www.united-domains.de/agb/ (as of: September 2025). In addition, the allocation policies apply: https://www.united-domains.de/agb/vergaberichtlinien/. There is no separate service description for domains, only special terms for add-on services (Domain-Tresor, WDP, DNS-API) per https://www.united-domains.de/agb-uebersicht/.
- Price display: gross. The price list states „inkl. 19 % MwSt.“. According to the VAT note, German gross prices are shown for orientation if no country is detected.
- Notes:
  - **Promotional prices in year 1** with a much higher follow-up price, e.g. .de 5 € → 19 €/year, .com 12 € → 27 €/year, .eu 5 € → 29 €/year. Each footnote says: „Vertragslaufzeit mind. 12 Monate“.
  - DNSSEC and Whois privacy are only available in the paid „Domain-Tresor“ package.
  - According to AGB section 7.3, united-domains acts as an intermediary unless it is itself the registrar for the TLD.
  - Robots.txt blocks `/*.pdf$` and `/whois/`. PDFs were therefore not fetched; they were not needed either.
- **Price source (Archiv-Issue 75, checked 2026-11-15): scraped (adapter `united-domains`).**
  - [robots.txt](https://www.united-domains.de/robots.txt) (retrieved 2026-11-15) allows `/domain-registrieren/preisliste/` and `/agb/` (it blocks e.g. `/whois/`, `/*.pdf$`, `/suchergebnis`, `/*internal-api/`, `/*tldapi/`). The [AGB](https://www.united-domains.de/agb/) (Stand September 2025, retrieved 2026-11-15) contain no clause on automated access.
  - The [price list](https://www.united-domains.de/domain-registrieren/preisliste/) is server-rendered HTML without bot protection: one section „Alle Top-Level-Domains“ (776 rows on 2026-11-15) plus sections for add-on products and the footnotes. One request per run.
  - Domains are orderable on their own (registrar), so the Methodik criterion [„ohne weiteren Vertrag (z. B. Hosting) bestellbar“](../pages/methodik.md#anbieterauswahl) is met. The row label „.de + WordPress“ (bundle) is ignored.
  - Gross and setup: „In den Preisen ist die Mehrwertsteuer (MwSt.) in Höhe von 19 % enthalten. Es fallen keine Einrichtungsgebühren an.“ (note under the list) → `vat_included: true`, `setup: 0`. The adapter throws if the note is missing.
  - Country-dependent display: [MwSt.-Hinweis](https://www.united-domains.de/mwst-hinweis/) (retrieved 2026-11-15): „Sollte es uns nicht möglich sein, Ihr Land zu identifizieren, zeigen wir in der Regel den Preis inklusive der deutschen Mehrwertsteuer als Orientierung.“ A visitor from another country may get other gross prices; the required 19 % note then fails the run instead of writing foreign prices.
  - Country detection is server-side with no public selection (no URL parameter, link, hreflang or country domain; checked in the price list, the MwSt.-Hinweis and the site scripts on 2026-11-15). The adapter therefore also requires the inline `UdFrontendConfig` to say `LOCALE` `de_DE` and `VAT_RATE` `1.19` (seen on 2026-11-15), and fails closed for any non-DE VAT. If the first run on a GitHub-hosted runner fails for that reason, the fallback is manual entry with the weekly gate (maintainer decision 2026-11-15).
  - Mapping: a row with „/Jahr“ is the price for every year (`year1` = `year1_regular` = `renewal`). A row with „/1. Jahr“ and a footnote is a first-year promo: `year1` from the row, `renewal` from the footnote („Ab dem 2. Jahr 19 € (inkl. 19 % MwSt.) / Jahr“), the footnote verbatim as `promo.conditions` (it names the conditions, e.g. „für Neuregistrierungen“, „Aktion gilt nicht für Premium-Domains“), `valid_until: null` (no end date stated). The footnote's first-year price must equal the row price.
  - `year1_regular: null` during a promo: the list does not state a regular first-year price. `transfer_in: null`: the list has no transfer prices; footnotes only say whether the promo also applies to transfers („Auch für Transfers gültig“ / „Nicht für Transfers gültig“).
  - Re-checked 2026-11-15 in the stored copy of the price list (no new request): the 13 promo rows (.at, .ch, .cloud, .com, .de, .eu, .info, .io, .me, .net, .online, .org, .shop) show only the first-year price and „/1. Jahr“, with no struck-through or „statt“ price; the footnotes name only the promo and the price „Ab dem 2. Jahr“. So `year1_regular` stays `null`. The follow-up price is `renewal`, not a regular first-year price. Consequence: a portfolio basket with more than one of these promo domains shows „k. A.“ for the total without promos (Archiv-Issue 74).
  - `.ai` (199 €/Jahr) is skipped: 2-year minimum at the registry, per-year vs per-term not stated.
  - Plausibility (Archiv-Issue 64, 2026-11-15): `.de` renewal 19,00 € (3.61× the median) and `.ch` renewal 99,00 € (4.81×) are the stated follow-up prices (footnotes 1 and 8), not parse errors.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | united-domains GmbH, Starnberg, DE (IONOS Group) | Impressum: „united-domains GmbH Gautinger Straße 10 82319 Starnberg Deutschland“ | [Kontakt / Impressum](https://www.united-domains.de/unternehmen/kontakt/) | 2026-11-12 |
| price_page | https://www.united-domains.de/domain-registrieren/preisliste/ | – | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| terms | AGB as of September 2025, plus allocation policies | AGB section 7.2: „gelten ergänzend die entsprechenden Vergaberichtlinien und zusätzlichen Vereinbarungen“ | [AGB](https://www.united-domains.de/agb/), [Vergaberichtlinien](https://www.united-domains.de/agb/vergaberichtlinien/) | 2026-11-12 |
| vat_display | gross (incl. 19 % VAT) | Price list: „Domain-Registrierungsgebühren pro Jahr (inkl. 19 % MwSt., beim Domain-Kauf. Es fallen keine Einrichtungsgebühren an.)“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/), [VAT note](https://www.united-domains.de/mwst-hinweis/) | 2026-11-12 |
| min_term_months | 12 | AGB section 14.1: „Verträge über Dienstleistungen werden grundsätzlich mit einer Mindestlaufzeit von einem Jahr geschlossen, danach laufen sie auf unbestimmte Zeit weiter“. Price list footnote .de: „Vertragslaufzeit mind. 12 Monate.“ | [AGB](https://www.united-domains.de/agb/), [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| notice_period_days | 30 (AGB: „1 Monat“ to the end of the term). **FAQ contradicts:** 14 days for .de/.eu/.com/.net/.org/.biz/.info, two months for all other TLDs. | AGB section 14.2: „Die ordentliche Kündigungsfrist beträgt 1 Monat. Während der Mindestlaufzeit oder einer vereinbarten Folgevertragslaufzeit kann die ordentliche Kündigung nur zum Ende dieser jeweiligen Laufzeit erfolgen.“ | [AGB](https://www.united-domains.de/agb/) | 2026-11-12 |
| notice_period_days (FAQ) | 30 („1 Monat“ for all TLDs) | FAQ: „Die Kündigungsfrist für alle Domain-Endungen beträgt 1 Monat.“ | [FAQ notice period](https://www.united-domains.de/help/faq-article/welche-kuendigungsfrist-hat-meine-domain/) | 2026-11-12 |
| notice_period_days (FAQ, deviating) | 14 or 60 | FAQ: „spätestens 14 Tage, für alle übrigen Endungen spätestens zwei Monate vor Ablauf der jeweils aktuellen Abrechnungsperiode“ | [FAQ refund](https://www.united-domains.de/help/faq-article/wenn-ich-vor-ablauf-der-registrierungsperiode-kuendige-bekomme-ich-dann-geld-zurueckerstattet/), [FAQ auth code](https://www.united-domains.de/help/faq-article/wie-erhalte-ich-den-auth-code-zum-transfer-meiner-domain-zu-einem-anderen-provider/) | 2026-11-12 |
| billing_cycle | yearly (12 months in advance) | AGB section 11.6: „Die Abrechnung erfolgt im Voraus und eine Abrechnungsperiode währt grundsätzlich zwölf Monate“ | [AGB](https://www.united-domains.de/agb/) | 2026-11-12 |
| auto_renew_default | yes (renewal by 12 months each time) | AGB section 11.7: „Eine jeweils folgende Abrechnungsperiode tritt verbindlich in Kraft, wenn nicht der Vertrag zum jeweiligen Ende einer Abrechnungsperiode gekündigt worden ist“. FAQ: „automatisch um weitere 12 Monate verlängert“ | [AGB](https://www.united-domains.de/agb/), [FAQ renewal](https://www.united-domains.de/help/faq-article/muss-ich-meine-domain-am-ende-der-registrierungsperiode-aktiv-verlaengern/) | 2026-11-12 |
| price_change_notice | yes: max. once per year, at least 4 weeks in advance in text form, special termination right effective at the time of the change | AGB section 11.15: „spätestens 4 Wochen vor dem geplanten Wirksamwerden in Textform mitteilen. Im Fall einer Preisänderung hat der Kunde das Recht, den Vertrag ohne Einhaltung einer Kündigungsfrist … zu kündigen.“ | [AGB](https://www.united-domains.de/agb/) | 2026-11-12 |
| setup_fee | 0 € | Price list: „Es fallen keine Einrichtungsgebühren an.“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| transfer_out | free, release via the transfer wizard. No refund for the current period. Transfer order at the latest 14 days (.de/.eu/.com/.net/.org/.biz/.info) or two months before the end of the period, otherwise renewal by 1 year (FAQ). | Price list: „Domain-Transfer von united-domains zu einem anderen Provider kostenlos“. AGB section 14.4: „bereits bezahlte Entgelte für diesen Zeitraum werden nicht erstattet“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/), [AGB](https://www.united-domains.de/agb/), [FAQ auth code](https://www.united-domains.de/help/faq-article/wie-erhalte-ich-den-auth-code-zum-transfer-meiner-domain-zu-einem-anderen-provider/) | 2026-11-12 |
| payment_methods | sepa, card (Visa, Mastercard, Diners, Amex), paypal. invoice only for companies with a commercial register entry or public authorities. | Payment page: „Die Zahlung per SEPA-Lastschrift steht allen Kunden offen.“ / invoice: „steht Unternehmen mit Handelsregistereintrag … und öffentlichen Einrichtungen/Behörden zur Verfügung“ | [Zahlung](https://www.united-domains.de/support/zahlung/) | 2026-11-12 |
| ssl_free | paid (SSL certificate Basis 36 €/year). A free SSL is not stated. | Price list: „SSL-Zertifikat Basis 36 € /Jahr“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| forward_301 | web forwarding free. Whether it is implemented as 301 is not stated, so unknown. | Price list: „Bei Domains inklusive: E-Mail-Weiterleitung, Web-Weiterleitung und Website-Vorlage“, „Webseiten-Weiterleitungen kostenlos“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| forward_302 | web forwarding free, type unknown (see above) | as above | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| dns_editor | free (included) | Price list: „Domain-Verwaltung mit DNS-Konfiguration“ (included with domains) | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| custom_ns | yes, „meist kostenlos“ (fee for some TLDs) | Price list: „Eintrag von Nameservern variiert je nach Endung (meist kostenlos)“. FAQ: „Bei einigen Domain-Endungen ist der Nameserver-Eintrag gebührenpflichtig.“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/), [FAQ name servers](https://www.united-domains.de/help/faq-article/wie-lasse-ich-nameserver-fur-meine-domain-eintragen/) | 2026-11-12 |
| dnssec | paid, only in Domain-Tresor (7,50 € in year 1, then 15 €/year; includes Domain Privacy, DNSSEC, 2FA for domain actions) | FAQ: „DNSSEC ist nicht einzel bestellbar, sondern zusammen mit Whois Domain Privacy und einer Zwei-Faktor-Authentifizierung für Domain-Aktionen Teil des Domain-Tresors.“ | [FAQ DNSSEC](https://www.united-domains.de/help/faq-article/dns-security-dnssec/), [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| email_forwarding | free (included) | Price list: „Bei Domains inklusive: E-Mail-Weiterleitung“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| whois_privacy | paid, only in Domain-Tresor (7,50 € in year 1, then 15 €/year) | Price list: „Domain-Tresor (Domain Privacy, DNSSEC, 2FA) 7,50 € /1. Jahr, danach 15 €/Jahr“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| api | paid: DNS API 60 €/year | Price list: „DNS API 60 € /Jahr“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| two_factor | yes, free for the portfolio login (OTP app). The 2FA „für Domain-Aktionen“ is part of the paid Domain-Tresor. | Security page: „Dieser Service ist für Kunden von united-domains selbstverständlich kostenfrei.“ | [Domain-Security](https://www.united-domains.de/domain-security/), [Zweistufige Verifizierung](https://www.united-domains.de/zweistufige-verifizierung/) | 2026-11-12 |
| sample .de | Year 1: 5 €. From year 2: 19 €/year (gross, promotion only for new registrations) | Footnote 1: „.de-Aktion: 5 € (inkl. 19 % MwSt.) im ersten Jahr für Neuregistrierungen von .de-Domains. Ab dem 2. Jahr 19 € (inkl. 19 % MwSt.) / Jahr.“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |
| sample .com | Year 1: 12 €. From year 2: 27 €/year (gross, promotion also for transfers) | Footnote 2: „.com-Aktion: 12 € (inkl. 19 % MwSt.) im ersten Jahr … Ab dem 2. Jahr 27 € (inkl. 19 % MwSt.) / Jahr.“ | [Price list](https://www.united-domains.de/domain-registrieren/preisliste/) | 2026-11-12 |

Open items:
- **Notice period conflict (AGB vs. FAQ):** AGB section 14.2 and the FAQ „Welche Kündigungsfrist …“ state 1 month. Two other FAQ articles state „14 Tage“ (.de/.eu/.com/.net/.org/.biz/.info) or „zwei Monate“ (other TLDs) and refer to the AGB, which do not contain these values. The AGB take precedence (30 days); both variants are recorded.
- **Refund conflict:** AGB section 11.9 provides for a pro-rata refund if the contract ends during a period. Section 14.4 (early deletion or transfer) and the FAQ exclude a refund. For domains, the more specific section 14.4 probably applies.
- Editorial error in the AGB: section 11.7 refers to the termination rules with „vgl. 13“, but these are in section 14 (section 13 is the Data Act).
- No documentation was found on whether web forwarding is implemented as 301 or 302 (or is selectable).
- For promotional prices, the data model should separate `year1` and `year1_regular` or the renewal. The footnotes provide both values in machine-readable form in the HTML.


---

# International reference providers

## Cloudflare Registrar (`cloudflare`)

- Operator: Cloudflare, Inc. (USA). Contracting party per the [Domain Registration Agreement](https://www.cloudflare.com/domain-registration-agreement/), preamble: „The terms “Cloudflare,” … shall refer to Cloudflare, Inc.“ (retrieved 2026-11-12). No German Impressum was found: `https://www.cloudflare.com/de-de/impressum/` returns HTTP 404, and `/de-de/domains/` redirects to the English page.
- Price list: https://www.cloudflare.com/domains/ (search; prices only appear per search result). There is no static price table. The supported TLDs are listed at https://domains.cloudflare.com/api/tlds (JSON, without prices) and https://www.cloudflare.com/tld-policies/.
- AGB: [Domain Registration Agreement](https://www.cloudflare.com/domain-registration-agreement/) (version: „Effective November 9, 2026“). It also incorporates the Self-Service Subscription Agreement. In addition, there is the documentation at [developers.cloudflare.com/registrar](https://developers.cloudflare.com/registrar/), which was fetched as [llms-full.txt](https://developers.cloudflare.com/registrar/llms-full.txt).
- Price display: USD. The prices are „at cost“ with no markup. VAT is **possibly charged in addition** based on the billing or bank address: DRA § 3.1 „you may be charged Value Added Tax … based on your bank and/or billing address“. A gross display for German consumers is not documented.
- Notes:
  - **.de and .eu are not offered.** They are missing from the TLD list `domains.cloudflare.com/api/tlds` (retrieved 2026-11-12). Included are, for example, `com` and `com.de`.
  - Domains must use Cloudflare name servers. Custom name servers are not possible.
  - For some TLDs, Cloudflare acts as a reseller of other registrars (DRA preamble: „as a reseller for services offered by other registrars“).
  - All payments are non-refundable (DRA § 3.1).
  - Automatic renewal is charged about 30 days before expiry.
- **Price source (Archiv-Issue 75, checked 2026-11-15): no offer for now.**
  - [robots.txt](https://www.cloudflare.com/robots.txt) (retrieved 2026-11-15): `Allow: /` for all user agents.
  - There is no public price list. Prices appear only in the interactive, client-side search on [cloudflare.com/domains](https://www.cloudflare.com/domains/) („Enter a name, domain, or website URL. Results update as you type.“, retrieved 2026-11-15). The TLD list [domains.cloudflare.com/api/tlds](https://domains.cloudflare.com/api/tlds) has no prices. DRA § 3.1: „You can review Registrar Fees due for each domain prior to registration via the search function“ ([DRA](https://www.cloudflare.com/domain-registration-agreement/), retrieved 2026-11-12).
  - Calling the search's backend would be automated access to a non-public interface, which the Methodik rule for client-side pages excludes. So: no adapter and no automated read-out.
  - Follow-up: Archiv-Issue 77 (prices entered manually in the browser by a person, then `method: "manual"`, `confidence: "medium"`).

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Cloudflare, Inc. (USA) | DRA preamble: „The terms “Cloudflare,” “Registrar,” “we,” “us,” or “our” shall refer to Cloudflare, Inc.“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| price_page | https://www.cloudflare.com/domains/ (search only, no table) | DRA § 3.1: „You can review Registrar Fees due for each domain prior to registration via the search function“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| terms | DRA, „Effective November 9, 2026“ | Page header | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| vat_display | net (USD); VAT possibly in addition, based on billing address | DRA § 3.1: „you may be charged Value Added Tax, Goods and Services Tax, or other localized fees and/or taxes, based on your bank and/or billing address“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| min_term_months | 12 (term selectable 1–10 years) | Docs „Register a new domain“ step 4: „Select the term (number of years) … Most top-level domains (TLDs) can be registered for a maximum of ten years.“ | [Docs](https://developers.cloudflare.com/registrar/get-started/register-domain/) | 2026-11-12 |
| notice_period_days | 30 (no contractual notice period; auto-renew must be disabled ≥ 30 days before expiry, because the charge happens then) | DRA § 3.4: „CLOUDFLARE WILL AUTOMATICALLY CHARGE YOU FOR RENEWAL APPROXIMATELY 30 DAYS BEFORE YOUR DOMAIN’S RENEWAL DATE“; Docs: „If you wish to disable auto-renew, do so at least 30 days prior to the expiration date.“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/), [Renew domains](https://developers.cloudflare.com/registrar/account-options/renew-domains/) | 2026-11-12 |
| billing_cycle | yearly (prepayment, registration/renewal also multi-year up to 10 years; auto-renew 1 year at a time) | DRA § 3.4: „AUTOMATIC RENEWAL AUTOMATICALLY RENEWS … FOR A RENEWAL PERIOD OF ONE YEAR“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| auto_renew_default | yes | DRA § 3.4: „DOMAIN NAMES ARE ENROLLED IN AUTOMATIC RENEWAL UNLESS YOU DISABLE SUCH AUTOMATIC RENEWAL“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| price_change_notice | no: changes are published online and take effect immediately, during a running term only from renewal; no special termination right stated | DRA § 3.3: „changes … shall be posted online at cloudflare.com and effective immediately without need for further notice to you.“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| setup_fee | none shown | Product page: „no hidden fees or required add-ons“ | [Product page](https://www.cloudflare.com/domains/) | 2026-11-12 |
| transfer_out | no fee stated; lock for 60 days after registration; auth code in the dashboard | DRA § 4.4: „You may not transfer any domain name registered through Cloudflare to another domain name registrar during the first sixty (60) days“ | [DRA](https://www.cloudflare.com/domain-registration-agreement/), [Transfer out](https://developers.cloudflare.com/registrar/account-options/transfer-out-from-cloudflare/) | 2026-11-12 |
| payment_methods | card, paypal (Apple Pay only for the first purchase, not for auto-renew); the DRA only mentions credit card | Docs (section „Billing information“ in the iCloud chapter): „Credit Card · PayPal · Apple Pay“; DRA § 3.2: „provide Cloudflare with your credit card information“ | [llms-full.txt](https://developers.cloudflare.com/registrar/llms-full.txt) (section iCloud Custom Email Domains), [DRA](https://www.cloudflare.com/domain-registration-agreement/) | 2026-11-12 |
| ssl_free | yes | „Every domain integrates with free DNS, CDN, SSL, and one-click DNSSEC“ | [Product page](https://www.cloudflare.com/domains/) | 2026-11-12 |
| forward_301 | unknown | Registrar pages do not mention URL forwarding | – | 2026-11-12 |
| forward_302 | unknown | as above | – | 2026-11-12 |
| dns_editor | yes, free | „free DNS“ | [Product page](https://www.cloudflare.com/domains/) | 2026-11-12 |
| custom_ns | no | FAQ: „No, all domains on Cloudflare Registrar use Cloudflare nameservers“ | [FAQ](https://developers.cloudflare.com/registrar/faq/) | 2026-11-12 |
| dnssec | yes, free (one-click) | „Free one-click DNSSEC“ | [Product page](https://www.cloudflare.com/domains/) | 2026-11-12 |
| email_forwarding | unknown | Registrar pages do not mention it | – | 2026-11-12 |
| whois_privacy | free (WHOIS redaction, where the registry allows it) | „Cloudflare Registrar offers personal data redaction on WHOIS for free“ | [WHOIS redaction](https://developers.cloudflare.com/registrar/account-options/whois-redaction/) | 2026-11-12 |
| api | yes (Registrar API, beta) | „Use the Cloudflare Registrar API to search for domain names, check real-time availability and pricing, and register supported domains programmatically.“ | [Registrar API](https://developers.cloudflare.com/registrar/registrar-api/) | 2026-11-12 |
| two_factor | unknown | not mentioned on the registrar pages | – | 2026-11-12 |

Price data (Archiv-Issue 77): manuell im Browser geprüft, 2026-11-15, kein gespeicherter Abruf. The owner read the prices in the [domain search](https://www.cloudflare.com/domains/search?q=tldcostcheck77) (a made-up name; the results list one price per TLD) in a browser; tldcost made no request. The offers have `method: manual`, `confidence: medium` and no `evidence_hash`.
- 15 TLDs, USD per year: .com .net .org .info .biz .io .co .me .ai .app .dev .online .shop .xyz .cloud. **Not offered:** .de, .at, .ch, .eu, .berlin.
- VAT: `vat_included: null`. Owner's note: „Keine USt.-Angabe in Domainsuche oder auf /products/registrar/ gefunden.“
- `transfer_in: null`: the search shows no transfer price.
- `setup: 0`: provider statement on the [product page](https://www.cloudflare.com/domains/): „no hidden fees or required add-ons“ (retrieved 2026-11-12).
- Struck-through prices: .org, .io, .app, .dev and .online show a lower price next to the struck-through regular price, without a stated period or condition. Methodik: „Eine Aktion übernehmen wir nur, wenn der Anbieter ihre Laufzeit (Beginn oder Ende) oder ihre Bedingungen nennt. Sonst gilt der reguläre Preis.“ So `year1` is the regular price. The lower prices (8,50 $, 32,00 $, 8,20 $, 8,20 $, 4,99 $) are not taken over.
- .ai: the search shows 160,00 $ for the 2-year minimum term, „Renews at 80,00 $/year“. So `year1` 160,00 $ with `term_years: 2` and `renewal` 80,00 $ per year.
- .ai, checked again by hand on 2026-11-24 at 07:36 UTC (owner, normal browser, not logged in, an invented .ai name in the domain search, chnet/tldcost#28): „2-year minimum $160.00 Renews at $80.00/year“. The values are unchanged; the offer carries this text as `evidence.quote`.

Open items:
- Whether 19 % VAT is added at checkout for German consumers is open. The DRA only says „may be charged“. The checkout was not checked (research method: no checkout).
- No German Impressum found: `/de-de/impressum/` returns 404. The address of Cloudflare, Inc. is not in the DRA.
- The payment methods are only listed in the iCloud chapter of the docs. DRA § 3.2 only mentions credit card. This is a conflict; the DRA takes precedence.
- URL forwarding (Redirect Rules), e-mail forwarding (Email Routing) and 2FA are general Cloudflare account features. They were not documented as registrar services and were not checked separately.
- .de and .eu are missing. So for the MVP TLD set, Cloudflare does not cover .de.

## Dynadot (`dynadot`)

- Operator: Dynadot Inc, a Californian stock corporation based in San Mateo, CA, USA. Evidence: [Terms of Use](https://www.dynadot.com/terms-of-use), preamble, and [contact page](https://www.dynadot.com/community/contact) with „Address: San Mateo, CA“, both retrieved 2026-11-12. An Impressum under German law and a full postal address were not found.
- Price list: https://www.dynadot.com/domain/prices (formerly `/domain/tlds`, redirects there). The table is paginated; detail pages per TLD exist, e.g. at https://www.dynadot.com/domain/de.
- AGB: [Terms of Use](https://www.dynadot.com/terms-of-use) (version: „Version date: 2026-10-02“). This is an overall contract with a registrar part. In addition, there are the help articles on auto-renew.
- Price display: USD by default; the currency is selectable (USD, EUR, CNY, CAD, MXN, GBP, BRL, INR, IDR). The price list says: „Pricing may vary based on fluctuations in currency exchange rates.“ There is no statement on VAT.
- Notes:
  - According to ToU § 6.3, auto-renew is opt-in.
  - Auto-renew is executed 15 days before expiry.
  - Renewals are non-refundable (ToU § 6.4).
  - .de: WHOIS privacy is not allowed („Privacy allowed: No“).
  - There is a separate reseller price level (`?price_level=reseller`).
- **Price source (Archiv-Issue 75, checked 2026-11-15): no adapter; manual entry follows.**
  - [robots.txt](https://www.dynadot.com/robots.txt) (retrieved 2026-11-15) allows `/domain/prices` and the TLD pages `/domain/<tld>`; it disallows `/domain/search?*` and `/change_currency.html`. The [Terms of Use](https://www.dynadot.com/terms-of-use) (retrieved 2026-11-15) contain no clause on automated access to the website.
  - The served currency is **not stable**: identical requests from the same client returned EUR, USD or CAD („C$“) prices, independent of the page (presumably cached per visitor currency). The currency can only be chosen through `/change_currency.html`, which robots.txt disallows.
  - The price list renders only its first 10 rows on the server; the pagination (`?page=N`) is client-side, so most target TLDs (e.g. .de, .info, .biz, .cloud) are not in the HTML.
  - The TLD pages are server-rendered, but on [.com](https://www.dynadot.com/domain/com) the registration price is marked „Registration *“ with „*Use coupon code 899COM“ (retrieved 2026-11-15). A coupon-based price never goes into `year1`.
  - Result: no adapter. Prices are to be entered manually in the browser with the currency set to USD (follow-up Archiv-Issue 77).

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Dynadot Inc (California, USA), San Mateo, CA | ToU preamble: „between Dynadot Inc, a Californian general stock corporation, and its affiliates“ | [ToU](https://www.dynadot.com/terms-of-use), [Contact](https://www.dynadot.com/community/contact) | 2026-11-12 |
| price_page | https://www.dynadot.com/domain/prices | – | [Price list](https://www.dynadot.com/domain/prices) | 2026-11-12 |
| terms | Terms of Use, version date 2026-10-02 | Header: „Version date: 2026-10-02“ | [ToU](https://www.dynadot.com/terms-of-use) | 2026-11-12 |
| vat_display | USD (currency selectable), VAT treatment unknown | Price list: „EN - USD ($)“; „Pricing may vary based on fluctuations in currency exchange rates.“ | [Price list](https://www.dynadot.com/domain/prices) | 2026-11-12 |
| min_term_months | 12 (.de: „Registration length 1-2 years“) | .de page: „Registration length · 1-2 years“; no general rule found in the ToU | [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| notice_period_days | unknown (no notice period specified; auto-renew is executed 15 days before expiry) | Help: „our system will take care of the renewal for you 15 days before the domain's expiration date“ | [Help set-auto-renew](https://www.dynadot.com/help/question/set-auto-renew) | 2026-11-12 |
| billing_cycle | yearly (prepayment; .de 1–2 years selectable) | .de page: „Renewal length · 1-2 years“ | [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| auto_renew_default | no (opt-in per ToU; default for future domains can be set in the account) | ToU § 6.3: „If You opt-in for automatic renewal of a Service but Dynadot is unable to process a transaction, then the automatic renewal shall not occur.“ | [ToU](https://www.dynadot.com/terms-of-use), [Help default-auto-renew](https://www.dynadot.com/help/question/default-auto-renew) | 2026-11-12 |
| price_change_notice | no: no commitment on the renewal price; changes to the terms without advance notice | ToU § 6.1: „Dynadot disclaims all warranties … respecting the fee applicable to and the length of the renewal“; § 1.4: „may be amended by Dynadot from time to time without specific advance notice to You“ | [ToU](https://www.dynadot.com/terms-of-use) | 2026-11-12 |
| setup_fee | none shown | Price list: „Our domain pricing has no hidden fees and no upselling at checkout.“ | [Price list](https://www.dynadot.com/domain/prices) | 2026-11-12 |
| transfer_out | fee not stated; .de „Transfers away from Dynadot: Supported“; no transfer in the last 10 days of the post-expiration period | ToU § 8.6: „You shall have no right to transfer the domain name to another registrant or to another registrar in the last 10 calendar days of the Post-Expiration Period.“ | [ToU](https://www.dynadot.com/terms-of-use), [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| payment_methods | card (credit/debit), paypal, Alipay, bank transfer/wire (min. $500; under $500 + $15 fee per ToU § 5), money order, check, account balance (prepay); no SEPA stated | Payment page: „Minimum wire amount: $500.“ | [Payment Options](https://www.dynadot.com/payment-options), [ToU](https://www.dynadot.com/terms-of-use) | 2026-11-12 |
| ssl_free | unknown | SSL is listed as a separate product; no statement „kostenlos“ (free) found | – | 2026-11-12 |
| forward_301 | unknown (forwarding free, type 301/302 not stated) | .com/.de page: „Included for FREE with all … domain names · Forwarding & Stealth Forwarding“ | [.com page](https://www.dynadot.com/domain/com) | 2026-11-12 |
| forward_302 | unknown (as above) | as above | [.com page](https://www.dynadot.com/domain/com) | 2026-11-12 |
| dns_editor | yes, free | „Included for FREE … Advanced DNS Settings“ | [.com page](https://www.dynadot.com/domain/com) | 2026-11-12 |
| custom_ns | yes | .de page: for .de, name servers must pass the DENIC check, with the guide „How to Set Nameservers for a .DE Domain“ | [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| dnssec | yes (cost not stated) | .com: „DNSSEC Supported · Yes“; .de: „DNSSEC supported · Supported“ | [.com page](https://www.dynadot.com/domain/com), [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| email_forwarding | unknown („One Branded Email Address“ is advertised as free) | „Included for FREE … One Branded Email Address“ | [.com page](https://www.dynadot.com/domain/com) | 2026-11-12 |
| whois_privacy | free (only „eligible TLDs“; .de: not allowed) | „domain privacy protection is free for life with every eligible domain registration“; .de: „Privacy allowed · No“ | [Security](https://www.dynadot.com/domain/security), [.de page](https://www.dynadot.com/domain/de) | 2026-11-12 |
| api | yes | ToU § 13 „APPLICATION PROGRAMMING INTERFACE“; product page /domain/api linked | [ToU](https://www.dynadot.com/terms-of-use) | 2026-11-12 |
| two_factor | yes (SMS or Google Authenticator, security key) | „You can choose between SMS authentication or the Google Authenticator app“ | [Security](https://www.dynadot.com/domain/security) | 2026-11-12 |

Price examples in USD for 1 year, standard price level:

| TLD | Registration | Renewal | Transfer | Source |
|---|---|---|---|---|
| .de | 3.88 | 3.88 | 3.88 | [.de page](https://www.dynadot.com/domain/de), 2026-11-12 |
| .com | 11.62 | 11.62 | 11.62 | [Price list](https://www.dynadot.com/domain/prices), 2026-11-12 |

Open items:
- VAT for German consumers is unknown. Checked were the price list, the payment page, the ToU (§ 5 Fees) and a web search. The only tax help article concerns the website builder shop, not domains.
- Auto-renew default: ToU § 6.3 speaks of „opt-in“. The help article „default auto-renew“ (as of 2023-11-07) only says that the default for future domains can be set. An explicit „default off“ was not found on the pages fetched.
- Minimum term and terms are only documented for .de. For .com, the page structure could not be read unambiguously.
- For forwarding, 301 or 302 is not specified. Free SSL and e-mail forwarding are not documented.
- The 60-day transfer lock after registration was not checked.

Price data (Archiv-Issue 77): manuell im Browser geprüft, 2026-11-15, kein gespeicherter Abruf. The owner read the [price list](https://www.dynadot.com/domain/prices) in USD in a browser; tldcost made no request. The offers have `method: manual`, `confidence: medium` and no `evidence_hash`.
- 20 TLDs, USD per year: .de .at .ch .eu .com .net .org .info .biz .io .co .me .ai .app .dev .online .shop .xyz .cloud .berlin. .ch and .dev are not in the price list (500 rows); their values come from the TLD pages (e.g. [.ch](https://www.dynadot.com/domain/ch)).
- VAT: `vat_included: null`. Owner's note: „Keine USt.-Angabe auf /domain/prices und den TLD-Seiten gefunden.“
- Preis mit Kennzeichnung "On Sale" ohne Laufzeit oder Bedingung nicht übernommen (Methodik). That affects 12 TLDs: .eu .org .info .biz .io .me .app .dev .online .shop .xyz .cloud. `year1` is the regular price.
- .app and .dev: the regular year-1 price is not shown (no struck-through price), so `year1` is empty and the totals show „k. A.“. The 2-year registration price (22,00 $ / 20,00 $) would imply 14,00 $ / 12,00 $ as the regular price; that is not taken over.
- .com: the coupon 899COM (8,99 $) is not taken over; a coupon price is not a promo price.
- `setup: 0`: provider statement on the [price list](https://www.dynadot.com/domain/prices): „Our domain pricing has no hidden fees and no upselling at checkout.“ (retrieved 2026-11-12).
- .co: year 1 15,50 $ without an „On Sale“ label (no struck-through price), renewal 31,20 $.
- .ai: prices per year, the page says registration and renewal for at least 2 years. So `year1` and `renewal` are 171,20 $ each with `term_years: 2` / `renewal_term_years: 2`; transfer 171,20 $.
- .ai, cart read by hand on 2026-11-24 at 07:35 UTC (owner, normal browser, not logged in, no checkout, chnet/tldcost#28): „2 years ($171.20)“, term options up to „7 years ($599.20)“, „Renews Nov2028 for $85.60“. This confirms `year1` 171,20 $ for 2 years and the per-year rate of 85,60 $. The cart does not state the renewal term, so `renewal_term_years: 2` still rests on the reading of the price list on 2026-11-15. The offer is unchanged.
- Transfer includes a term (`transfer_includes_term`), as the owner checked it: yes for .com .net .org .info .biz .io .co .me .online .shop .xyz .cloud .berlin (source: the price list); no for .at and .ch („Renewal Upon Transfer: None“). Yes for .de: the [.de page](https://www.dynadot.com/domain/de) shows „Renewal upon transfer: 1 Year“ (retrieved 2026-11-19 as `tldcost-bot`, one static request). Not stated for .eu, .ai, .app, .dev; the TLD pages probably show „Renewal Upon Transfer“, to be checked at the next Archiv-Issue 77 check.
- .berlin: „Restriction: Connection to Berlin.“

## Porkbun (`porkbun`)

- Operator: Porkbun LLC, 11575 SW Pacific Hwy PMB 40649, Tigard, OR 97223, USA. Sources: [legal page, footer](https://porkbun.com/legal) and [registration agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement), both retrieved 2026-11-12. There is no Impressum under German law. Oregon law applies.
- Price list: https://porkbun.com/products/domains
- AGB: [Domain Name Registration Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) (version: „This agreement is effective March 17, 2025.“). The clauses are not numbered; references below give the section heading.
- Price display: USD. The price list says: „All prices are in USD. … All prices include ICANN and any other fees.“ It does not say whether VAT is included or added.
- Notes:
  - Many TLDs have a promotional price in the first year only („Sale!“, „1st Yr Sale!“), e.g. .de.
  - Fees are non-refundable.
  - The agreement requires written notice 30 days in advance for termination. The effect on domains is unclear (see open items).
  - According to the provider, DNS is operated by Cloudflare.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Porkbun LLC, Tigard, OR, USA | Footer: „11575 SW Pacific Hwy PMB 40649 Tigard, OR 97223, US“; agreement: „Porkbun LLC (“Porkbun”)“ | [Legal](https://porkbun.com/legal) | 2026-11-12 |
| price_page | https://porkbun.com/products/domains | – | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| terms | Domain Name Registration Agreement, effective 2025-03-17 | Header: „This agreement is effective March 17, 2025.“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| vat_display | USD, VAT treatment unknown | Price list: „All prices are in USD. … All prices include ICANN and any other fees.“ (no statement on VAT) | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| min_term_months | 12 | Section „TERM OF SERVICE“: „each Porkbun Service is for a one-year initial term, and is renewable thereafter for successive one to ten-year terms“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| notice_period_days | 30 (per the agreement, for terminating the agreement; auto-renew can be turned off in the account) | Section „TERMINATION OR SUSPENSION OF SERVICES“: „Should You elect to cancel or terminate this Agreement with Porkbun, You agree to provide at least thirty (30) days’ written notice“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| billing_cycle | yearly (prepayment, renewal 1–10 years; auto-renew = length of the last period) | „TERM OF SERVICE“: „renewal period equal in time to the most recent service period“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| auto_renew_default | yes (derived from the wording: renewal unless disabled) | „TERM OF SERVICE“: „Unless You disable the automatic renewal option, Porkbun will automatically attempt to renew Your Services“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| price_change_notice | no: no advance notice of price changes, no special termination right. Only for changes to the agreement: notification, effective after 30 days, remedy = transfer or termination | „FEES AND PAYMENT“: „Please check the Pricing Page often for any changes to our Services fees.“; „CHANGES TO THIS AGREEMENT“: „any such change binds You: (1) thirty (30) days after We notify You“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement) | 2026-11-12 |
| setup_fee | none shown | Price list: „All prices include ICANN and any other fees.“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| transfer_out | fee not stated; lock for 60 days after initial registration; outbound transfer can be expedited in the account (otherwise 5 days) | Section „CHANGE OF REGISTRAR“: „You may not transfer Your domain name registration to another domain name registrar during the first sixty (60) days“ | [Agreement](https://porkbun.com/legal/agreement/domain_name_registration_agreement), [KB 139](https://kb.porkbun.com/article/139-how-to-approve-an-outbound-transfer-from-porkbun) | 2026-11-12 |
| payment_methods | card, paypal (not for automatic payments), Apple Pay, Google Pay, Amazon Pay, Alipay, crypto (USDC), US bank account via ACH (account balance); no SEPA | „At the moment, PayPal can’t be used for automatic payments.“ | [Payment Options](https://porkbun.com/support/payment_options) | 2026-11-12 |
| ssl_free | yes (Let's Encrypt) | „we offer Let's Encrypt SSL certificates at no charge for all supported domains“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| forward_301 | yes, free | „Our URL Forwarder supports 302, 301, and masked forwards.“; „free URL Forwarding“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| forward_302 | yes, free | as above | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| dns_editor | yes, free | „free DNS management powered by Cloudflare“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| custom_ns | yes | KB: „If you are using external nameservers on your domain, please refer to …“ | [KB 216](https://kb.porkbun.com/article/216-how-to-enable-porkbuns-cloudflare-dnssec) | 2026-11-12 |
| dnssec | yes (toggle „Porkbun DNSSEC“; cost not stated) | „In the Details dropdown menu, find the option labeled "Porkbun DNSSEC".“ | [KB 216](https://kb.porkbun.com/article/216-how-to-enable-porkbuns-cloudflare-dnssec) | 2026-11-12 |
| email_forwarding | yes, free (up to 20) | „up to 20 free email forwards“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |
| whois_privacy | free; .de: n/a (registry, see Cross-cutting findings); .eu: none (Porkbun is „unable to offer“ it there; EURid itself shows e-mail and language of individuals, so the registry does not make it n/a). The list is open-ended („and potentially others“), so free only applies to TLDs that are not on it. | „Porkbun includes FREE WHOIS Privacy for all participating domains.“; „Due to individual registry policies, Porkbun is unable to offer WHOIS Privacy for the following TLD extensions: … de, us, … eu, …“ | [Price list](https://porkbun.com/products/domains), [WHOIS Privacy](https://porkbun.com/products/whois_privacy), [KB 97](https://kb.porkbun.com/article/97-how-to-configure-whois-privacy-service-porkbun) | 2026-11-13 |
| api | yes | Link „API Access“ → /api/json/v3/documentation | [FAQ](https://porkbun.com/about/porkbun-faq) | 2026-11-12 |
| two_factor | yes (2FA, WebAuthn) | „Protect your account with security technologies like WebAuthn, 2FA, login notification“ | [Price list](https://porkbun.com/products/domains) | 2026-11-12 |

`year1_regular` during a first-year sale (Archiv-Issue 75, rule: only when the source states a regular first-year price): the API has no list price, so the adapter does not write `year1_regular` during a sale (registration < renewal), and the stored value stays. Kept only where a source is recorded:
- .de: 5.49 USD, struck through on the price list (table below);
- .co: 31.20 USD, TLD page „regular registration / renewal / transfer“ (`promo.conditions`, Archiv-Issue 35).

The other 10 sale offers (.app .biz .cloud .dev .info .io .online .org .shop .xyz) have `year1_regular: null`: no source is recorded per TLD. Without a sale, `year1_regular` = the API registration price.

Price examples, read from the `data-price-*` attributes of the [price list](https://porkbun.com/products/domains) on 2026-11-12, in USD for 1 year, non-premium:

| TLD | Registration (year 1) | Renewal | Transfer |
|---|---|---|---|
| .de | 2.90 (promotion; regular price struck through $5.49) | 4.07 | 5.10 |
| .com | 11.81 | 11.81 | 11.81 |
| .eu | 5.88 | 5.88 | 5.88 |

.ai (chnet/tldcost#28): the adapter skips .ai because the API gives one price without a term. The offer is entered by hand (`method: manual`, `confidence: medium`, no `evidence_hash`).
- Read by hand on 2026-11-24 at 07:39–07:40 UTC: the owner searched an invented .ai name on the [.ai page](https://porkbun.com/tld/ai) in a normal browser, not logged in, and opened the cart without a checkout. .ai page: „At Cost $82.70 / year renews at $82.70“. Cart: „Registration 2 Year $165.40 est. renewal $82.70“ and „.ai domain names uniquely require registration and renewal periods of at least two years. … If you have auto-renew turned on, the domain will renew for two years instead of one as it nears expiration.“
- The term comes from the cart, which has no stable public URL; `source_url` is the .ai page.
- Data: `year1` 165,40 $ with `term_years: 2`, `renewal` 165,40 $ with `renewal_term_years: 2` (the provider states the 2-year renewal itself). Transfer was not checked: `transfer_in: null`. No `features`.

Open items:
- VAT for German consumers is unknown. Checked were the price list, the payment options page and KB searches for „vat“, „tax“ and „invoice“: no hit on VAT. A third-party source (dn.org) claims VAT-inclusive prices for EU customers. It was not used because it is not a primary source.
- The 30-day written notice period in the agreement does not match the practice of turning off auto-renew in the account. KB article 70 (turning off auto-renew) was not fetched. Clarify whether a deadline applies to not renewing.
- The cost of DNSSEC is not stated explicitly.


## Amazon Route 53 (`aws-route53`)

Added 2026-11-15 (Archiv-Issue 97). **Verified:** „manuell im Browser geprüft, 2026-11-15, kein selbst berechneter Hash“ (Archiv-Issue 77, 09:06:21Z). A person compared the 18 values with the PDF in the browser. The offers have no `evidence_hash`, because there is no stored download by the person; `fetched_at` is the time of the check.

**Requests made for this section (disclosure).** On 2026-11-15 between 07:03:18Z and 07:10:08Z, the tldcost tooling (User-Agent `tldcost-bot/0.1.0 (+https://tldcost.io/methodik/)`, one request at a time, 5 s apart) sent 11 requests to AWS hosts:
- aws.amazon.com (9): `/robots.txt`, `/terms/`, `/route53/pricing/` (07:03:18Z–07:03:34Z, before the Site Terms had been read), then `/legal/aws-emea/`, `/service-terms/`, `/tax-help/european-union/`, `/route53/domain-registration-agreement/`, `/agreement/` and `/tax-help/emea-vat-tables/` (07:03:59Z–07:10:08Z);
- d32ze2gidvkk54.cloudfront.net (2): `/robots.txt` (403) and the price list PDF (07:04:15Z).

The PDF and the pages after 07:03:34Z were fetched **after** the Site Terms clause on „data mining, robots, or similar data gathering and extraction tools“ had been fetched, so this read-in itself falls under that clause. No further requests to AWS hosts are made by tldcost tooling. The values were then verified by a person in a browser (Archiv-Issue 77); the read-in is not the evidence.

- Operator and contracting party: **Amazon Web Services, Inc., 410 Terry Avenue North, Seattle, WA 98109-5210, USA** (country `US`). [Domain Name Registration Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) (Last Updated: September 1, 2026) § 1.1: „This Agreement is between you and Amazon Web Services, Inc. (“AWS”).“ In a conflict with the AWS Customer Agreement, it applies „with respect to your use of the Domain Name Registration Services, but only to the extent of such conflict“.
  - However, for an account in Germany, **Amazon Web Services EMEA SARL** (38 Avenue John F. Kennedy, L-1855 Luxembourg) is the „AWS Contracting Party“ of the [AWS Customer Agreement](https://aws.amazon.com/agreement/) („Any country within Europe, the Middle East, or Africa (excluding South Africa)“). It also invoices: „AWS Europe provides all invoicing and payment services for your accounts based in these countries“ ([AWS Europe FAQ](https://aws.amazon.com/legal/aws-emea/)). Owner decision (2026-11-15, Archiv-Issue 97): country `US`, with the footnote „Rechnung über AWS EMEA SARL (LU) mit USt.“ (`country_note`, shown as a footnote on the „Land“ cell and in the row detail, Archiv-Issue 102).
  - Registrars: „Amazon Registrar, Inc. (“Amazon Registrar”), and other ICANN-accredited registrars“ (§ 2.1).
- Price list: the PDF linked from the [pricing page](https://aws.amazon.com/route53/pricing/) („View a full list of current standard pricing by TLD“): [Amazon_Route_53_Domain_Registration_Pricing_20140731.pdf](https://d32ze2gidvkk54.cloudfront.net/Amazon_Route_53_Domain_Registration_Pricing_20140731.pdf). The file name says 2014; the PDF metadata says it was generated on 2026-11-12. It has 11 pages and about 410 TLDs.
- **Source: manual entry, no adapter.**
  - [robots.txt](https://aws.amazon.com/robots.txt) does not disallow `/route53/pricing/`. The CloudFront host of the PDF serves no robots.txt (HTTP 403).
  - [AWS Site Terms](https://aws.amazon.com/terms/) (Last Updated: June 4, 2025), „LICENSE AND SITE ACCESS“: „This license does not include any resale or commercial use of the AWS Site or its contents; any derivative use of the AWS Site or its contents; any downloading or copying of any other users’ account information; or any use of data mining, robots, or similar data gathering and extraction tools.“
  - Automated access is therefore excluded. Offers: `method: manual`, `confidence: medium`, `source_url` = the PDF. „Manual“ means a person in a browser (Archiv-Issue 77), not a tldcost request. No `evidence_hash`: the check by hand stored no download of its own (Archiv-Issue 77). The weekly data update does not touch these offers, because it runs registered adapters only and Route 53 has none. Re-checks go through Archiv-Issue 77. Not used: the `route53domains` `ListPrices` API (needs AWS credentials), a headless browser, an AWS account.
  - Owner decision (2026-11-15, Archiv-Issue 97): the Site Terms risk is accepted under these conditions:
    - only single price facts with a link to the source, no texts or layout from AWS;
    - no automated access to any AWS site, including the weekly data update;
    - the row is removed immediately if AWS asks.
- **Price display: USD, net.** PDF: „All charges exclude fees and taxes, as per Section 9.4 of our Domain Name Registration Agreement.“ § 9.4: „All fees and charges payable by you are exclusive of applicable taxes and duties, including VAT and applicable sales tax.“ AWS Europe adds VAT at invoicing: „At the time of invoicing, AWS calculates and applies applicable VAT based on the information you have provided in your AWS account“ ([AWS Europe FAQ](https://aws.amazon.com/legal/aws-emea/)). AWS Europe has a branch („Niederlassung“) in Germany ([Tax help EU](https://aws.amazon.com/tax-help/european-union/)).
  - Offers: `vat_included: false`, `vat_rate: 1900` per offer (the provider's `vat_rate` stays `null` like the other US providers). Source for 19 %: the AWS [VAT Rate Summary Table (EMEA)](https://aws.amazon.com/tax-help/emea-vat-tables/), columns „VAT/GST for Accounts without TRNs“ and „VAT/GST for Accounts with TRNS“: „GERMANY 19% 19%“. A consumer account in Germany has no TRN, so AWS Europe charges 19 % German VAT.
- **Prices:** one column „Registration and Renewal Price (Per Year)“, so `year1` = `renewal`, no `year1_regular`. No promotions: „Promotional Credit cannot be used for Amazon Route 53 domain name registration fees or charges.“ No setup fee in the list (`setup: 0`). Premium domains are excluded („Prices for premium domains might differ.“; § 9.2: initial registration of premium domains is not supported).
- **Transfer:** the column „Transfer Price“ and its „Transfer Term“.
  - „Renewed with transfer“ (17 of the 18 entered TLDs): the transfer price includes one year.
  - .ch: transfer 0 USD, „No change“: no year added.
  - `transfer_includes_term` (Archiv-Issue 91): `true` for the 17 TLDs, `false` for .ch. `transfer_includes_term_source` is the PDF URL with the provider’s wording from the column „Transfer Term“ as quote („Renewed with transfer“ / „Renewed with Transfer“, as spelled per row; .ch „No change“).
- **.ai: angeboten, Werte nicht von Hand bestätigt (k. A.)** (owner decision 2026-11-15). The offer marks .ai as offered; all price fields are `null`, with no term and no transfer values, so the row has no total. Values read in by the assistant are not used. `confidence: low`.
- **Hosted zone (DNS) is optional and not part of the TCO:** „$0.50 per hosted zone per month for the first 25 hosted zones“ ([pricing](https://aws.amazon.com/route53/pricing/)). A domain can be registered without it; the bundling rule (Archiv-Issue 87) does not apply.
  - `dns_editor: "paid"` on all 19 offers (Archiv-Issue 124): manuell im Browser geprüft, 2026-11-15 (owner, German pricing page, no automated request, no hash). Quote: „0,50 USD pro gehostete Zone im Monat für die ersten 25 gehosteten Zonen“; second line: „0,10 USD pro gehostete Zone im Monat für zusätzliche gehostete Zonen“. `price_cents` 50 (USD, like the offers), `unit` month, note „für die ersten 25 gehosteten Zonen; danach 0,10 USD je Zone und Monat“.
- Limits: „There is a default limit of 20 domain name registrations per account.“ ([pricing](https://aws.amazon.com/route53/pricing/)).

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | Amazon Web Services, Inc., Seattle, USA (owner decision; invoicing for EU accounts by AWS EMEA SARL, LU) | § 1.1: „This Agreement is between you and Amazon Web Services, Inc.“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| terms | Amazon Route 53 Domain Name Registration Agreement | „Last Updated: September 1, 2026“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| vat_display | net, USD; AWS Europe adds 19 % VAT for accounts in Germany | PDF: „All charges exclude fees and taxes“; § 9.4; VAT table: „GERMANY 19% 19%“ | [PDF](https://d32ze2gidvkk54.cloudfront.net/Amazon_Route_53_Domain_Registration_Pricing_20140731.pdf), [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/), [VAT table](https://aws.amazon.com/tax-help/emea-vat-tables/) | 2026-11-15 |
| min_term_months | 12 | Pricing page: „Domain names are registered in annual increments.“ | [Pricing](https://aws.amazon.com/route53/pricing/) | 2026-11-15 |
| notice_period_days | 35 (no notice period as such; auto-renew can be turned off at any time, but renewal runs about 35 days before expiry) | § 7.2.4: „You may enable or disable Automatic Renewal at any time.“ § 7.2.6: „Automatic Renewal typically occurs thirty-five (35) days before the expiration date … certain ccTLDs require that Automatic Renewal occur closer to the expiration date“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| billing_cycle | yearly | § 7.2.2: „renews the registration … for a renewal period of one year, unless the Registry Operator specifies a different renewal period“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| auto_renew_default | yes | § 7.2.1: „AUTOMATIC RENEWAL WILL BE ENABLED BY DEFAULT.“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| price_change_notice | no | § 9.1.4: „Registration and renewal prices are subject to change at any time.“; § 7.2.3: renewal „at the then-current AWS rates“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| refunds | none | § 9.1.3: „Prices and fees … are non-refundable unless otherwise expressly noted“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |
| whois_privacy | proxy enabled automatically where allowed (third party, WhoisProxy.com); price not stated | § 3.1.1: „you automatically enable a third-party Proxy Registration Service protection, except where prohibited“ | [Agreement](https://aws.amazon.com/route53/domain-registration-agreement/) | 2026-11-15 |

Prices from the PDF (USD, net, per year; transfer with its term):

| TLD | Registration and renewal | Transfer | Transfer term |
|---|---|---|---|
| .ai | k. A. | k. A. | k. A. (offered, values not confirmed by hand, see above) |
| .app | 20.00 | 20.00 | Renewed with transfer |
| .berlin | 76.00 | 76.00 | Renewed with transfer |
| .biz | 26.00 | 26.00 | Renewed with Transfer |
| .ch | 14.00 | 0.00 | No change |
| .cloud | 26.00 | 26.00 | Renewed with transfer |
| .co | 38.00 | 38.00 | Renewed with Transfer |
| .com | 16.00 | 16.00 | Renewed with Transfer |
| .de | 9.00 | 9.00 | Renewed with transfer |
| .dev | 17.00 | 17.00 | Renewed with transfer |
| .eu | 8.00 | 8.00 | Renewed with transfer |
| .info | 30.00 | 30.00 | Renewed with Transfer |
| .io | 71.00 | 71.00 | Renewed with transfer |
| .me | 31.00 | 31.00 | Renewed with transfer |
| .net | 17.00 | 17.00 | Renewed with Transfer |
| .online | 28.00 | 39.00 | Renewed with Transfer |
| .org | 16.00 | 16.00 | Renewed with Transfer |
| .shop | 43.00 | 43.00 | Renewed with Transfer |
| .xyz | 19.00 | 19.00 | Renewed with Transfer |

.at is not in the list (not offered).

Open items: .ai values, only after a check by hand (Archiv-Issue 77).

---

# Portal operator's offering

chnet.domains is collected under the same rules as all other providers (concept § 3.1, decision Q2).

## chnet.domains (`chnet-domains`)

- Operator: CHnet Solutions Plus UG (haftungsbeschränkt), Bahnhofstr. 2, 37339 Breitenworbis, Germany. Amtsgericht Jena HRB 518247, VAT ID DE322044365 ([Impressum](https://chnet.solutions/impressum/), retrieved 2026-11-12). The Impressum is on chnet.solutions and is linked from the footer of chnet.domains.
- Price list: https://chnet.domains/preise/ (124 TLDs, with notice period per TLD)
- AGB: [AGB Domain-Leistungen](https://app.chnet.domains/agb.html) (as of: 3 November 2026, version 2026-11-03; feature rows re-checked against version 2026-11-13 on 2026-11-15). Annex A contains the notice periods per TLD. Annex B is the withdrawal notice at https://app.chnet.domains/widerruf.html (not fetched).
- Price display: gross (final prices incl. 19 % VAT) for consumers, net plus VAT for businesses (AGB § 4 Abs. 1).
- **Source:** the price list https://chnet.domains/preise/, scraped by the weekly data update (adapter `chnet-domains`). One static HTML table with the columns „Endung“, „Kategorie“, „Preis pro Jahr“ and „Kündigungsfrist“, gross („Preis pro Domain und Jahr, inklusive 19 % USt.“). [robots.txt](https://chnet.domains/robots.txt) allows everything („User-agent: * / Allow: /“, checked 2026-11-25). Before the adapter existed, the 14 offers came from a single fetch on 2026-11-13 (seed data), and the weekly update did not refresh them, because it runs registered adapters only.
- **Mapping:** the single yearly price is used as year1 and renewal (AGB § 4 Abs. 1: the current list price applies to subsequent terms, see the note below the table), `confidence: high` as before. Setup 0: the list shows no setup fee. Rows marked „§ Besondere Vergabebedingungen“ are written like any other row: the footnote says the registry sets extra requirements, „zum Beispiel einen Sitz in der EU oder einen Bezug zur Region“, not a different price (marked on 2026-11-25: .app, .berlin, .dev, .eu). Only the 14 TLDs with an offer file are written; .at, .ch and .berlin are on the list and skipped until a maintainer decides. TLDs with a 24-month minimum term (.gr, .nu, .tk) are skipped, because the list states a price per year only.
- **Check 2026-11-25:** one request to the list; all 14 prices equal the stored offers.
- Notes:
  - **Reseller.** According to AGB § 2 Abs. 4, registration is done „über den Reseller-Dienstleister Neue Medien Münnich (ALL-INKL.COM)“. The notice periods are the registrar periods of ALL-INKL.COM plus 2 days processing time (Annex A).
  - Domains are billed collectively each month: collective invoice on the 1st of the following month, 12 months in advance per domain.
  - After the first term, consumers can terminate at any time with one month's notice and receive a pro-rata refund of overpaid fees, calculated to the day.
  - .gr, .nu and .tk have a minimum term of 24 months.
  - DNS management and custom name servers cost extra: 1,90 €/year per domain each, or a flat 24,90 €/year in the „Domain Admin Plan“ (AGB § 8b since version 2026-11-13: „Mit dem Domain Admin Plan nutzt der Kunde die Zusatzleistungen DNS-Verwaltung und eigene Nameserver (§ 8a Abs. 1) für alle Domains seines Kundenkontos“, „Der Plan kostet 24,90 € je Jahr (Endpreis inkl. USt.)“; price list: „DNS-Verwaltung und eigene Nameserver für alle Domains Ihres Kundenkontos, auch für künftige.“). In the data: `"paid"` with `feature_costs` (Archiv-Issue 124), as for every other provider.
  - **Status on the retrieval date:** the website shows „Wartungsarbeiten.“, „Die Domainbestellung ist in Kürze verfügbar.“ and „Vorschau – noch nicht öffentlich“. Ordering via the landing page was not possible on 2026-11-12.

| Field | Value | Evidence (quote) | Source | Retrieved |
|---|---|---|---|---|
| operator | CHnet Solutions Plus UG (haftungsbeschränkt), Breitenworbis, DE | Impressum: „Angaben gemäß § 5 DDG · CHnet Solutions Plus UG (haftungsbeschränkt) · Bahnhofstr. 2 · 37339 Breitenworbis“ | [Impressum](https://chnet.solutions/impressum/) | 2026-11-12 |
| price_page | https://chnet.domains/preise/ | – | [Price list](https://chnet.domains/preise/) | 2026-11-12 |
| terms | AGB version 2026-11-03 | „Stand: 3. November 2026 (Version 2026-11-03)“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| vat_display | gross (consumers), net plus VAT (businesses) | AGB § 4 Abs. 1: „Gegenüber Unternehmern verstehen sich Preise netto zuzüglich gesetzlicher Umsatzsteuer, gegenüber Verbrauchern als Endpreise inklusive Umsatzsteuer.“ | [AGB](https://app.chnet.domains/agb.html), [Price list](https://chnet.domains/preise/) | 2026-11-12 |
| min_term_months | 12 (.gr .nu .tk: 24) | AGB § 5 Abs. 1: „Die erste Laufzeit beträgt zwölf Monate ab diesem Tag, bei Domainendungen mit einer Mindestlaufzeit nach Anlage A 24 Monate“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| notice_period_days | 7 (.de, .com, .eu and others; .dk/.es 16; group .io/.me/.co and others 37) before the renewal date. Consumers after the first term: 1 month at any time | AGB Anlage A: „5 Tage · 7 Tage · vor dem Verlängerungstag“; AGB § 5 Abs. 3: „jederzeit mit einer Frist von einem Monat“ | [AGB](https://app.chnet.domains/agb.html), [.de page](https://chnet.domains/de-domain-registrieren/) | 2026-11-12 |
| billing_cycle | yearly in advance per domain (for 24-month TLDs, first term 24 months), billed via a monthly collective invoice | AGB § 6 Abs. 1: „Am 1. jedes Monats berechnet CHnet alle Domains, deren Verlängerungstag im Vormonat lag … zwölf Monate“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| auto_renew_default | yes (tacit renewal; consumers after the first term: indefinite period) | AGB § 5 Abs. 2: „Die Laufzeit verlängert sich jeweils um weitere zwölf Monate … wenn die Domain nicht bis zur Kündigungsfrist nach Anlage A gekündigt wird.“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| price_change_notice | yes: at least 42 days in advance in text form, special termination right; adjustment only cost-based | AGB § 4 Abs. 3: „Eine Preiserhöhung wird dem Kunden mindestens sechs Wochen (42 Tage) vor dem Verlängerungstag … in Textform mitgeteilt“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| setup_fee | none shown | Price list only states „Preis pro Domain und Jahr, inklusive 19 % USt.“ | [Price list](https://chnet.domains/preise/) | 2026-11-12 |
| transfer_out | free, even with an open invoice; AuthCode by e-mail; consumers receive a refund calculated to the day, businesses none | AGB § 7 Abs. 3: „CHnet schickt ihn kostenlos und ausschließlich an die E-Mail-Adresse des Kundenkontos“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| payment_methods | paypal, sepa (via Stripe), card (via Stripe); invoice only by agreement | AGB § 6a Abs. 1: „Der Kunde hinterlegt im Kundenbereich eine Zahlungsart: PayPal, SEPA-Lastschrift oder Kreditkarte; Zahlung auf Rechnung nur nach § 6 Abs. 2.“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| ssl_free | limited: Let's Encrypt automatically only for web space at CHnet and for forwarding via a CHnet server; no entitlement | AGB § 8 Abs. 4: „beantragt CHnet automatisch TLS-Zertifikate … derzeit bei Let's Encrypt“; § 8 Abs. 2: „ein Anspruch auf HTTPS besteht nicht“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| forward_301 | unknown (forwarding is offered, type not stated) | AGB § 8a Abs. 1: „Im Kundenbereich kann der Kunde Weiterleitungen einrichten“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| forward_302 | unknown (as above) | as above | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| dns_editor | paid (1,90 €/year per domain or Domain Admin Plan 24,90 €/year; included for hosting customers) | AGB § 8a Abs. 2: „Jede Zusatzleistung kostet 1,90 € je Domain und Jahr (Endpreis inkl. USt.).“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| custom_ns | paid (same as dns_editor) | AGB § 8a Abs. 1: „mit der Zusatzleistung eigene Nameserver — eigene Nameserver eintragen“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |
| dnssec | unknown | not mentioned in the AGB, home page, price list, .de page | – | 2026-11-12 |
| email_forwarding | yes, part of the domain-only service. The paid add-ons are only DNS management and custom name servers (§ 8a Abs. 1–2, price list „Domain Admin Plan“). | AGB § 8 Abs. 2: „Im Modus „nur Domain“ richtet CHnet Weiterleitungen ein … Eine E-Mail-Weiterleitung wird erst aktiv, wenn der Empfänger sie bestätigt hat.“; § 8a Abs. 2: „Jede Zusatzleistung kostet 1,90 € je Domain und Jahr“ | [AGB](https://app.chnet.domains/agb.html), [Price list](https://chnet.domains/preise/) | 2026-11-15 |
| whois_privacy | .de: n/a (DENIC does not publish holder data of natural persons). Other TLDs: unknown; no statement that a privacy service is or is not offered. | Privacy policy 3.6: „DENIC veröffentlicht keine Inhaberdaten natürlicher Personen.“ AGB § 11 only mentions publication in Whois/RDAP „soweit die Vergabebedingungen das vorsehen“ | [Privacy policy](https://app.chnet.domains/datenschutz.html), [AGB](https://app.chnet.domains/agb.html) | 2026-11-15 |
| api | unknown | not mentioned | – | 2026-11-12 |
| two_factor | yes (TOTP, optional) | AGB § 2 Abs. 3: „einen zweiten Faktor (TOTP) kann der Kunde im Profil einschalten“ | [AGB](https://app.chnet.domains/agb.html) | 2026-11-12 |

Price examples in EUR per year incl. 19 % VAT according to the [price list](https://chnet.domains/preise/) of 2026-11-12. The page does not show a separate renewal price; according to AGB § 4 Abs. 1, the current list price applies to subsequent terms.

| TLD | Price/year | Notice period |
|---|---|---|
| .de | 5,50 € | 7 days |
| .com | 15,57 € | 7 days |

Open items:
- Order status: on the retrieval date, the site was in maintenance and preview mode („Vorschau – noch nicht öffentlich“). Before adding it to the portal, check whether the offering can be ordered publicly.
- DNSSEC, WHOIS privacy (except .de), API and the forwarding type (301/302) are not stated on the public pages (re-checked 2026-11-15).
- AGB § 12 (changes to the AGB) and the withdrawal notice (Annex B) were not evaluated in detail.

