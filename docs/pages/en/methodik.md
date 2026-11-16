---
title: Methodology
slug: methodik
lang: en
source_sha256: "5de3835bf38c609a8f9c2acef9cecd6f14f3838e287b6794ddbc37e444411ec5"
---

# Methodology

This page explains which data tldcost collects, how the table is sorted and how the total cost is calculated. It meets the transparency duty for comparisons under Section 5b(2) of the German Unfair Competition Act (UWG): the main parameters of the ranking and their weighting.

## Summary

- We show the prices and contract terms of domain providers in one table, one row per provider.
- **Default sorting:** total cost over 3 years, gross, ascending.
- Every column can be sorted. The chosen sorting is part of the URL, so you can share and reproduce it.
- There is **no score, no recommendation, no “test winner” and no ratings**.
- No provider pays for inclusion, placement or presentation. There are no affiliate links and no tracking.
- :::nur-oeffentlich
  Every value has a public source, a timestamp and evidence. All data is openly available in the [GitHub repository](tldcost:repo/).
  :::
  :::nur-privat
  Every value has a public source, a timestamp and evidence. All data is openly available as JSON at [/api/](/en/api/) (licence [CC BY 4.0](/en/lizenz/)).
  :::

## Main parameters and weighting

The order of the rows follows **first and foremost from the sort column**; on a tie, the rules below apply. There is no weighting of several criteria and no manual placement.

| Setting | Default | Can be changed |
|---|---|---|
| Sort column | Total cost over 3 years | any column |
| Sort direction | ascending (cheapest first) | yes |
| Prices | gross (incl. VAT) | gross/net switch |
| Total cost | total over 2, 3 and 5 years, each in its own column | shown or hidden in the column selection |

If two rows have the same value in the sort column, this order applies, whatever the sort direction:

1. Total over 3 years (`sum_3y`), ascending, in the chosen price mode (gross or net).
2. Provider ID (`providerId`), ascending.

So on a tie the price decides first, not the name. No provider, not even the operator’s own offer, moves up because of its name.

Missing values always come last, whatever the sort direction.
In yes/no columns (e.g. SSL certificate, DNSSEC), ascending means “yes” (included, no extra charge) first, then “paid” (the provider offers the feature only for a fee; the source and, where stated, the price are in the details), then “no”.

**Whois privacy** (protection of the holder’s data in the public Whois/RDAP). In ascending order:

| Rank | Value | Shown as | Meaning |
|---|---|---|---|
| 1 | `free` | free | The provider protects the holder’s data at no extra cost. |
| 1 | `n/a` | not applicable | The registry does not show the holder’s data publicly anyway (e.g. .de). Equivalent to “free”. |
| 2 | `paid` | paid | The provider offers the protection only at an extra cost. |
| 3 | `none` | not offered | The registry shows the holder’s data, and the provider offers no protection. |
| – | `null` | – | Not publicly documented. Always comes last. |

## Total cost (TCO)

The table shows the total cost for 2, 3 and 5 years in separate columns. For N years (N = 2, 3 or 5):

```
Total_N = setup fee + year 1 price + sum of the payments due in years 2 to N
Avg per year = Total_N / N
```

- For years 2 and 3 we use a separate price if the provider states a different one. Otherwise the regular renewal price applies.
- The price for year 2 or 3 applies to the payment that falls due in that year. With a minimum term of 2 years or more, nothing falls due in year 2, so the price for year 2 does not apply.
- From year 4 onwards, the renewal price always applies.
- Transfer fees (transfer in, transfer out) are shown in their own columns. They are not part of the total cost in the table, because the table calculates a new registration. The transfer of existing domains is calculated by the [portfolio calculator](#portfolio-calculator).

### Minimum term longer than one year

Some TLDs can only be registered or renewed for several years in advance, e.g. for 2 years. In that case:

- The first payment covers the whole minimum term.
- The total cost over N years includes **every payment that falls due within the N years**, each in full. That is the amount you actually pay in that time.
- The average per year stays Total_N / N.
- The minimum term is shown in the column “Minimum term”.

Example: registration only for 2 years.

| Renewal | 2 years | 3 years | 5 years |
|---|---|---|---|
| yearly | 1 payment (2 yrs) | 1 payment (2 yrs) + 1 renewal | 1 payment (2 yrs) + 3 renewals |
| only for 2 years | 1 payment (2 yrs) | 2 payments (2 yrs each) | 3 payments (2 yrs each) |

## Portfolio calculator

The [portfolio calculator](/en/portfolio/) calculates a whole portfolio of several TLDs and counts (e.g. 10× .de, 3× .com, 5× .eu) over 1, 2, 3 or 5 years, per provider.

- **New registration:** per domain the total cost as in the table (Total_N), times the count. A promotional price only counts for as many domains as the provider states per TLD or per customer. If the provider states no number, it counts for a single domain per provider, namely for the TLD with the smallest saving; all other domains pay the regular price in year 1. If the provider states explicitly that there is no limit per customer for a TLD (verbatim quote as evidence), the promotional price counts for every domain of that TLD and does not count against the per-customer limit. If the provider states no regular price for the first year, we calculate these domains in the first year at its renewal price and mark this in a footnote.
- **Transfer of existing domains:** for a transfer we calculate the transfer fee plus the renewal price from the first year, unless the provider states that the transfer includes one year of registration. The first renewal is then due in the second year. We document this statement with a source. If the provider renews the TLD only for several years at once (e.g. .ai for 2 years), it is unclear which term the transfer includes: we then show “transfer term unclear” and no total. Promotional prices for new registrations do not apply to a transfer. The setup fee counts once per domain in both cases.
- If a provider lacks a TLD or a required value (e.g. the transfer price), it gets no total. The row shows what is missing (“missing”, “transfer price missing”, “transfer term unclear”).
- Order: by total, ascending; providers without a total come last. As in the table there is no recommendation, and the operator’s own offer differs only by its badge.
- As in the table, the result table can be sorted and filtered by every column (Country: filter only). Providers without a total always stay at the end, and an amount filter hides them only if you untick “n/a” explicitly. With a filter, the highlight marks the lowest value among the providers shown.
- **Cheapest combination:** per TLD the cheapest provider, all of them on a tie. This means several customer accounts.
- Prices without a VAT statement stay as stated and carry their footnote. The total must then not be read as a gross price.
- The calculation runs in your browser with the same open data as the table. Nothing is stored; the portfolio is only in the address of the page.

## Gross and net

- The default is **gross, including the VAT the provider charges a consumer in Germany** (usually 19%). This matches the price indication to consumers under the German Price Indication Ordinance (PAngV).
- If a provider states net prices, we convert them to gross with the provider’s VAT rate.
- The “net” switch is meant for business customers.
- We convert prices in a foreign currency to euros with the reference rate of the European Central Bank. The rate and its date are shown with the value.

## Promotional prices

- “Year 1” is the **actual** price in the first year, including a publicly offered promotion, but **without a voucher code**.
- We only take over a promotion if the provider states its period (start or end) or its conditions. Otherwise the regular price applies.
- We also store the regular price without the promotion.
- Promotional prices get the badge “Promotional price”. Conditions (e.g. “new customers only”, end date) are shown as a footnote on the value. Conditions quoted from a provider stay in German.
- Because the default sorting calculates over 3 years, a cheap first year cannot hide a high renewal price.
- **Voucher codes do not count.** Prices that only apply with a code you have to enter are not part of the total cost, even if the code is public. We mention public codes at most in a footnote. tldcost is not a voucher portal.

## Sources and evidence

Every price and every contract term carries:

| Field | Meaning |
|---|---|
| `source_url` | public page of the provider, available without a login |
| `fetched_at` | time of collection |
| `method` | `api` (provider’s price list or interface), `scrape` (read automatically from the website) or `manual` (entered by hand) |
| `evidence_hash` | checksum of the fetched page or response |
| `confidence` | `high`, `medium` or `low`; manual entries without evidence are always `low` |

<!-- TODO C4: Datum der Veröffentlichung -->
From the publication of the repository, every change to the data is a commit in the public repository; from then on, the Git history is the complete price history. Older states (since 13 Nov 2026) are in the private predecessor repository. In addition, `data/history/` keeps a price history per offer, with one entry per price change (date and source); it starts with the data as of November 2026 and holds no older prices.

## Collection and updates

| Level | Source | Interval |
|---|---|---|
| A | structured price lists or interfaces of the providers | weekly (Mondays) |
| B | public price pages of the providers (read automatically) | weekly (Mondays) |
| C | contract terms and features from terms and conditions and product pages, entered by hand | checked at least every 90 days |

Rules for the automatic collection:

- Only publicly visible price pages. No bypassing of logins or bot protection.
- We respect `robots.txt` and fetch each page at most once a day.
- At most one request per second per provider.
- Our fetcher identifies itself in the user agent as `tldcost-bot`, with a link to the project: `tldcost-bot (+https://tldcost.io/methodik/)`.
- If a regular price (year 1 without a promotion, renewal) changes by more than 30%, or a setup or transfer fee rises by more than 30% or from 0, we do not take the new value over automatically. A person checks it first.
- Promotional prices do not trigger this check, because promotions start and end all the time. We take them over automatically with a badge, but only with a statement of their period or conditions (see [Promotional prices](#promotional-prices)).
- If a collection fails, the last checked value stays. The date of the data (“Data as of”) is shown for every value.

## Collection per provider

The table is built from the data when the site is generated. How a price was collected is stated in every offer (`method`, see [Sources and evidence](#sources-and-evidence)). If a provider has no offers, the reason is given there.

::erhebung-je-anbieter{lang=en}

## Provider selection

We include providers that

- sell domains to end customers in Germany or serve as an international price reference, and
- state their prices publicly and without a login, and sell domains without any further contract (e.g. hosting).

Which providers are collected how, and why some have no offers, is shown under [Collection per provider](#collection-per-provider).
Inclusion cannot be bought. If a provider asks us to, we remove its data without delay.
The complete list is in [`data/providers/`](tldcost:repo/tree/main/data/providers).
If a provider is missing, anyone can suggest it: [Suggest a provider](tldcost:report/anbieter).

## The operator’s own offer

tldcost is operated by CHnet Solutions Plus UG. It also sells domains itself under **chnet.domains**.

- chnet.domains appears as an **ordinary row** in the table, with the visible badge “Operator’s own offer”.
- The same collection, the same source rules and the same sorting apply to chnet.domains as to all others.
- It is not highlighted. Automated tests check that sorting by any column gives the same order with and without the operator badge.

## What we deliberately do not show

- **Ratings and stars.** We cannot verify that they are genuine.
- **Quality of support.** It cannot be measured objectively.
- **Recommendations or overall grades.**

## Known gaps

- The selection of providers and TLDs is not complete.
- Contract terms entered by hand can be up to 90 days old. The date is shown with the value.
- We do not collect individual conditions (reseller prices, volume discounts, customer discounts).
- **Providers outside the EU:**
  - We convert foreign currencies with the reference rate of the European Central Bank on the day of collection. The rate and its date are shown with the value.
  - Your actual final price can differ, because your payment method uses a different rate or charges fees.
  - Whether a provider outside the EU charges VAT to German consumers is not always clear. If the provider does not mention VAT, we show its price without a surcharge and mark it with a footnote. The net switch does not change this price.
- The offer on the provider’s own website always prevails.

## Reporting and correcting errors

Use “Report an error” in any table row, or directly: [Report an error](tldcost:report/preis). We only take over corrections with a public source, even if they come from the provider itself.
If a provider confirms its data and its affiliation has been verified, its row gets the badge “Confirmed by provider”.
