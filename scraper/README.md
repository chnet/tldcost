# @tldcost/scraper

Collects public domain prices and the ECB reference rates into `data/`. One adapter per
provider; `run.ts` merges the results into `data/offers/<provider>/<tld>.json`, applies the
plausibility gate and writes `data/fx/<ECB date>.json`. When an offer's price state changes, it
also appends an entry to `data/history/<provider>/<tld>.json` (`npm run history:sync` does the
same for every stored offer, e.g. after a hand edit; nothing is fetched).

```sh
npm run scrape -w scraper -- --dry-run            # fetch, print the diff, write nothing
npm run scrape -w scraper -- --only inwx --no-fx  # one adapter, no FX
npm run scrape -w scraper -- --report report.json # machine-readable report (for the scheduled workflow)
```

Options: `--dry-run`, `--only <ids>`, `--no-fx`, `--tlds <list>` (default: the 20 MVP TLDs),
`--data-dir <dir>`, `--report <file>`, `--max-change <ratio>` (default `0.3`),
`--plausibility-low <share>` (default `1/3`), `--plausibility-high <multiple>` (default `3`),
`--user-agent <ua>` (or `TLDCOST_USER_AGENT`). No secrets are needed.

Exit code `1` = at least one `gate` violation (a price jump on stored data needs a human); `2` = bad
usage; otherwise `0`. Everything else leaves the stored data untouched and is only reported: offers
with a violation of kind `blocked`, `promo-required` or `delisted`, a failed adapter, failed TLDs, a
failed FX fetch. All other offers are written in every case. The report lists each violation with
its `kind` (`gate` | `blocked` | `promo-required` | `delisted`). Without `--report` output (exit 1
and no file) the run crashed.

## Rules every request follows

- Only `HttpClient` (`src/http.ts`) talks to the network. Per host it reads `robots.txt` first
  (RFC 9309: 4xx = no restrictions, 5xx or unreachable = disallow all) and sends requests one after
  another, at least `max(1 s, Crawl-delay)` apart (ECB: 5 s).
- User-Agent `tldcost-bot/<version> (+https://tldcost.io/methodik/)`. It is configurable, but
  it must keep the `name/version (+https://…)` form and must never contain an e-mail address.
- No cookies, no credentials, no login, no bot-protection workarounds. Redirects are followed
  manually (at most 3), with a `robots.txt` check for the target. 429/503 back off (Retry-After,
  at most 2 retries, never longer than 120 s).
- A run sends about 64 requests: ALL-INKL 2, checkdomain 3 (+1 per TLD whose promo hint in the domain data does not match), DomainFactory 2, Hetzner 2, INWX 2 (+1 with the CSV fallback), netcup 22, one.com 2, Porkbun 2, STRATO 23, united-domains 2, ECB 2.

## Adapters

| Adapter | Source | Price basis | Not collected yet |
| --- | --- | --- | --- |
| `domainfactory` | the domain page `www.df.eu/de/domains/` (static HTML, table „Alle Domainendungen“, same as the price list `/de/preislisten/`) | EUR gross, monthly prices for a 12-month billing period (`unit: month`); promo „Aktionspreis im 1. Jahr“ with the conditions quoted from the page footnote, no end date; setup from „Einrichtungsgebühr“; ICANN fee included for gTLDs; „#“ marker = reseller-discount footnote (checked). The gross and monthly-price notes, the promo conditions (for a promo) and the „#“ footnote (for a marked TLD) are checked on every run; a missing one fails. A missing setup or ICANN statement gives `null` | transfer price, `.dev`/`.app`/`.ai` (not sold) |
| `porkbun` | public pricing API `api.porkbun.com/api/json/v3/pricing/get` (never `porkbun.com/api/*`, disallowed there) | USD, no VAT statement (`vat_included: null`); coupon codes are never applied; on a first-year sale (registration < renewal) list price and promo stay as maintained by hand, and without a stored promo the offer is blocked | list price during a sale, `.ai` |
| `inwx` | `www.inwx.de/api/v1/domain/all-prices`; fallback: CSV download, reported as a warning. CSV rows are written only when registration = renewal (provably regular); other rows are blocked, fail closed | EUR net (`vat_included: false`); active public promos go to `year1` + `promo.valid_until` | `.ai` (2-year period) |
| `hetzner` | price list of the Domain Registration Robot `www.hetzner.com/de/registrationrobot/` (static HTML table, 8 TLDs); konsoleH is not used (307 loop for automated requests) | EUR gross as displayed (`vat_included: true`), per year; the single yearly amount is year1 and renewal (`confidence: medium`); setup from the column „einmalig“ | TLDs outside the Robot (e.g. `.io`); transfer prices except `.de` |
| `netcup` | product page per TLD (`__NUXT_DATA__`), mapping from `products-de-DE.xml`; cross-checked against the visible text | EUR gross as displayed: `round(net × 1.19)` per month (`unit: month`); billing periods over 12 months (`.ai`: 24) as payment per term with `term_years` | transfer price; deals/free months fail the TLD |
| `all-inkl` | price list `all-inkl.com/domains/preise` (one static table) | EUR gross; columns „Einrichtung“ → `setup`, „Jahresgebühr“ → `year1` = `renewal` (`confidence: medium`). Only TLDs marked as domain plan („Domain-Tarif“, own contract for one domain) are written; add-on domains that need a hosting or server plan are skipped (owner rule Archiv-Issue 75); rows billed two years in advance are skipped | transfer price; free month |
| `strato` | product page per TLD (`www.strato.de/domains/<tld>-domain/`, price card at the top); promo condition from the FAQ of `domain-kosten` | EUR gross per month (`unit: month`), 12-month billing period (`VLZ12`); first-year price as promo, "danach" price as renewal, `year1_regular: null` during a promo (the card names no regular first-year price); setup fee from the card line "Einrichtung: X €", else from the row "Einrichtungsgebühr" of the product table on the same page (header "TLD" or "Domainendung", then the TLD), else from the 12-month entry with the card's order code on the domain list `www.strato.de/domains/` (fetched once per run; its prices must equal the card; run warning with the quote for table and list, stored in `price.setup_source` with the page URL); none, or the sources differ: the TLD fails. The list also cross-checks card and table TLDs that it lists. A list that cannot be fetched fails only the TLDs that need it; a list that is fetched but cannot be read (entry text of another form, two different entries for one order code, prices that differ from the card) fails every listed TLD (fail closed), so a layout change of the list stops practically all STRATO TLDs. A card line with "Einrichtung" in another form fails the TLD | transfer price; the 1-month billing variant |
| `checkdomain` | `window.tldList` embedded in `www.checkdomain.de/domains/` (price, setup, contract period, promo per TLD), cross-checked against the price list `www.checkdomain.de/agb/preisliste/` (VAT note, price, setup, minimum term); both pages ISO-8859-1 | EUR gross per month as displayed (`unit: month`, billed 12 months in advance); a promo goes to `year1` only when its hint names the TLD and both amounts match; on a mismatch the footnote of the TLD's own page is read and its hint taken when it matches (warning); a hint naming another TLD with exactly this TLD's amounts, in the domain data and on the TLD page, gives the regular price without the promo (warning); else the TLD fails, naming what the TLD page said; `evidence_hash` covers the domain data; `confidence` high with a promo hint (states the price after year 1), else medium; minimum terms other than 12 months (`.ai`: 24) are skipped | transfer price; trustee fees (`.eu`, `.berlin`) |
| `united-domains` | price list `www.united-domains.de/domain-registrieren/preisliste/` (one static page, TLD section only) | EUR gross, required note „In den Preisen ist die Mehrwertsteuer (MwSt.) in Höhe von 19 % enthalten. Es fallen keine Einrichtungsgebühren an.“ (`setup: 0`), and the inline `UdFrontendConfig` must say `LOCALE` `de_DE`, `VAT_RATE` `1.19` (server-side country detection, fail closed); „/1. Jahr“ rows: `year1` from the row, `renewal` from the footnote („Ab dem 2. Jahr …“), footnote verbatim as `promo.conditions`, `year1_regular: null`; full labels (`com.de`, punycode IDN), duplicates and unknown row layouts throw | transfer price, `.ai` |

TLDs a provider does not sell are reported as "not offered", never written. TLDs whose
multi-year term is not verified (whether the price is per year or per term) are skipped on purpose.

## Merge and gate

- The scraper owns `currency`, `vat_included`, the price fields it sets, `promo` and `evidence`.
  Everything else in an offer file (`contract`, `features`, `vat_rate`, `transfer_out`,
  `provider_verified`, …) is kept as maintained by hand.
- A price field an adapter leaves out (or a `promo` it leaves undefined) is unknown to the source
  and keeps its stored value; `null` overwrites. A scraped promo without conditions keeps the
  hand-written conditions of the same promo (same `valid_until`). Default term years (1) are left
  out of the file.
- An adapter only runs when `data/providers/<id>.json` exists.
- Gate (concept finding 2, violation `kind: gate`, exit 1): an offer is **not** written when
  `year1_regular` or `renewal` changes by more than 30 %, when `setup` or `transfer_in` rises by
  more than 30 % or from 0 (decreases pass), or when currency, unit, term or VAT basis change.
  `year1` is not gated: promo starts are normal and show up in `promo`. The gate message names
  the likely cause: "stored promo ended" for a `year1_regular` jump when the stored offer had a
  (year-1) promo and the new one has none; for `transfer_in` always the end of a transfer
  promotion or a price increase (the data records no transfer promotion, so the source has to be
  checked).
- Market switch (owner decision 2026-11-19, „Fremdmarkt“ in docs/decisions.md): the switch between
  the German display (EUR, gross, no `foreign_market`) and a foreign market display (USD, net,
  `foreign_market` with the offer's currency) passes the gate in both directions, without the
  currency, VAT and price checks (the amounts of two markets are not comparable); unit and term
  checks stay. The summary, the tracking issue („Marktwechsel“) and the data commit name it as
  „Markt DE -> US“. In the price history it starts a new segment (entry field `market`); any other
  change of currency, VAT mode or market is blocked as before. The scraper owns `foreign_market`
  like the prices: an offer without it is the German display.
- Reported only (exit 0, stored data untouched):
  - `delisted`: a stored offer the provider no longer lists; the file is kept.
  - `blocked`: an offer the adapter marks as untrustworthy, e.g. a CSV price that may be an
    unmarked promo, or an offer whose stored `setup` or `transfer_in` number becomes `null` (a
    known fee the source no longer states; a later `null` -> number step would pass the gate
    unseen). It is not written.
  - `promo-required`: a sale without a stored promo. It is not written. This also covers a list
    price the adapter derives from the current price (`derivedListPrice`, Porkbun: the API has no
    list price) when it falls below the stored list price: that may be a sale at or above the
    renewal price. With a stored promo that has not expired (`valid_until`), the stored list price
    and promo stay. Without a stored list price but with a stored promo, the offer is written (the
    sale has usually ended) with a provider warning to check it by hand.
- Unchanged prices still refresh `evidence.fetched_at` and `evidence_hash` (the data's freshness);
  the summary lists them as "unchanged (evidence refreshed)". Any other evidence change
  (`source_url`, `method`, `confidence`, …) is listed per offer in the summary and in the report
  (`changes[].evidence`), also when the prices are unchanged.

## Plausibility check

After the run, every offer in `data/` (stored data with this run's offers in place of the stored
ones, so a dry run checks what it would write) is compared with the other providers for the same
TLD: its regular price per year, gross, in EUR (`renewal`, else `year1_regular`; never a promo
`year1`; monthly x 12, multi-year terms per year, ECB rate for other currencies; `@tldcost/core`
`plausibilityCheck`). A value below `--plausibility-low` x or above `--plausibility-high` x the
median of the other providers is listed, only when at least 3 OTHER providers have a comparable
value for the TLD (at least 4 in all).
Typical cause: a monthly price taken as yearly or the other way round (factor 12). Hits never
block and never change the exit code. They are in the report (`plausibility`), in the summary
(`? PLAUSIBILITY …`) and in the tracking issue of the scheduled update (its "Update bereit" line
names the number of hits). Offers that cannot be compared (no regular price, a term the TCO
rejects such as a monthly price with a term other than 1 year, a missing VAT or FX rate, a value of
0) are left out, listed in the report (`plausibility.uncomparable`) and counted in the summary. A changed stored price
already stops at the 30 % gate, so the check matters most for new offers and hand-maintained data.
With only 2 others their median would be their mean, and one outlier would also flag the two normal
offers; that is why 3 others are required. The offer itself is never part of its median, so an
outlier cannot dampen its own detection.

## Tests and fixtures

`npm test -w scraper` (vitest, 100 % coverage). Fixtures in `test/fixtures/` are trimmed real
responses from 2026-11-12/13 (MVP TLDs only; netcup pages reduced with
`scripts/trim-netcup-fixture.mjs`; the Hetzner page from 2026-11-15, reduced to its price card; the all-inkl list from 2026-11-15, MVP TLDs plus .gr and .lv for the two-year marker; the checkdomain pages from 2026-11-15, MVP TLDs plus .art for its English promo hint, kept as ISO-8859-1 bytes, and the .com and .at pages from 2026-11-19 (UTF-8), reduced to their footnote list; the united-domains list from 2026-11-15, MVP TLDs plus multi-level, IDN and edge rows, reduced with
`scripts/trim-united-domains-fixture.mjs`) and are excluded from prettier so they stay byte-exact.
The one.com US display has no fetched fixture (a German address cannot see it): `one-com.test.ts`
builds a synthetic one from the German list under the runners' display settings, marked there.
