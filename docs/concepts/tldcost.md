# Concept: domain price comparison ("tldcost")

**Status:** concept, not implemented · **Created:** 2026-11-01 · **Owner:** the operator (CHnet Solutions Plus UG)
**Implementation:** against the milestone (see section 9)

---

## 1. Problem

Anyone who wants to register a domain only finds comparisons that

- rely on the **introductory price** (year 1 „ab 0,42 €/Monat“, "from 0,42 €/month") but hide the renewal price,
- are **commission-driven** (experte.de, trusted.de: „zum Anbieter*“, "to the provider*"), so order and selection are not neutral,
- **ignore contract terms**: minimum term, notice period, billing cycle, transfer-out fees, net/gross,
- are international (tld-list, domcomp, tldes, TLDSpy, domainoffer.net) and strongly focused on US registrars and coupon codes; German providers (IONOS, Strato, All-Inkl, netcup, INWX, Hetzner, united-domains, checkdomain, DomainFactory, Host Europe, Contabo, one.com) are missing or incomplete.

Goal: a **plain, verifiable table** in the style of instances.vantage.sh. Select the TLD at the top, one provider per row, columns with the real total cost over 2/3/5 years and the contract terms. The unique selling point is not the amount of data, but **transparency and incorruptibility that can be proven**.

## 2. Analysis

### 2.1 Competitors (as of 11/2026)

| Portal | Strength | Weakness for our goal |
|---|---|---|
| tld-list.com | 3.000+ TLDs, ~55 registrars, refresh every 3 h, 3-year score, price history, API (paid) | US-heavy, promo focus, freemium, hardly any DE providers, no contract terms |
| domcomp.com | 1.700 TLDs, 25 providers, daily, coupons | as above |
| tldes.com | API (100+ registrars, hourly, CORS, OpenAPI) | data supplier, no DE focus, prices "as on the website" without tax logic |
| TLDSpy | API with `total_cost_3_year/5_year` | same |
| domainoffer.net | 150 registrars, "Challenge this offer" | coupon portal |
| experte.de / trusted.de | DE providers, monthly price | affiliate links, no term/notice data, ranking not explained |

**Gap:** No portal shows, for the DE market, the gross total cost over several years **together with** minimum term, notice period, billing cycle and transfer terms. None of them discloses how it collects its data.

### 2.2 Model: instances.vantage.sh

Open-source repo (vantage-sh/ec2instances.info): a scraper generates static JSON data → static site generator (Next.js) → CDN. No backend, no login, data freely available via API, community PRs. We adopt exactly this pattern: **data as versioned artifacts, the site is purely static.**

### 2.3 Legal situation in Germany (relevant for the concept, not legal advice)

- **BGH I ZR 55/16 (27.04.2017)** (Federal Court of Justice): If a portal lists only providers that pay a commission, this is material information (§ 5a UWG, German Unfair Competition Act) and must be clearly recognisable. A notice in the business customer section is not enough.
- **§ 5b Abs. 2 UWG (since 28.05.2022)** (section 5b para. 2): The main ranking parameters and their weighting must be provided. Paid placements must be labelled as advertising.
- **§ 5b Abs. 3 UWG** (section 5b para. 3): Anyone who shows customer reviews must explain how their authenticity is ensured → **we show no reviews** (deliberately).
- **OLG Hamburg 5 U 45/24 (2024, Check24)** (Hamburg Higher Regional Court): Advertising only one's own offers under the label „Vergleichsportal“ (comparison portal) is misleading.
- **PAngV (Price Indication Ordinance):** Towards consumers, total prices including VAT → gross is the default, with a net toggle for businesses.
- **Scraping:** Only publicly visible price lists, no circumvention of login/bot protection, respect robots.txt, moderate frequency, source + timestamp per data point.

### 2.4 Conflict of interest: the central design question

The operator sells domains itself through **chnet.domains** (.de for 5,50 € gross/year, All-Inkl reseller). An "incorruptible" portal run by the same operator is only credible if the conflict is **openly and mechanically neutralised**, not just explained. See § 3.1.

## 3. Proposed solution

### 3.1 Incorruptibility design (the product)

1. **Open data + open source.** Datasets (JSON) and scrapers live in a public GitHub repo. Every price carries `source_url`, `fetched_at`, `method` (`api` | `scrape` | `manual`), `evidence_hash` (hash of the source page/response) and optionally a screenshot link. Every change is a Git commit → **full price history and audit trail for free**.
2. **No affiliate links.** Links go directly to the provider's price page without tracking parameters. If sponsoring ever comes: never in the table, never in the sort order, labelled separately (§ 5b UWG).
3. **Ranking = user choice.** The default sort order is the 3-year total cost (documented on the Methodik page (methodology)). Every column is sortable. The sort state is in the URL (shareable, reproducible). No score, no "recommendation", no "test winner".
4. **Own offer (chnet.domains):** listed as an **ordinary row** with a visible badge „Angebot des Portalbetreibers“ ("offer of the portal operator"), same data collection, same rules, no highlighting. The Impressum (legal notice) names CHnet Solutions Plus UG and chnet.domains explicitly. (Alternative: exclude it — see owner decision Q2.)
5. **Methodik page** (mandatory under § 5b Abs. 2): what is collected, how TCO is calculated, which providers are included and why, how promotional prices are handled, update interval, known gaps.
6. **Correction workflow:** "Report an error" opens a pre-filled GitHub issue. Providers can supply their own data via PR, but it is accepted **only with a public source** (no "we tell you the price"). Status field `provider_verified: true/false`.
7. **No user data:** no login, no cookies, no tracking (possibly server-side, aggregated access counts from CloudFront logs). No cookie banner needed.
8. **Public changelog** (price changes per provider/TLD, data corrections).

### 3.2 Data model

```jsonc
// data/offers/<provider>/<tld>.json  (one file per provider×TLD, easy to diff)
// schema/offer.schema.json is binding. Amounts in whole cents (504 = 5,04 €).
{
  "schema_version": 1,
  "provider": "netcup",            // → data/providers/netcup.json
  "tld": "de",
  "currency": "EUR",
  "vat_included": true,            // false: gross via vat_rate (offer, otherwise provider; basis points, 1900 = 19 %)
  "price": {
    "unit": "year",                // year|month
    "setup": 0,
    "year1": 504,                  // actual price in year 1 (promo already included)
    "year1_regular": 504,          // list price without promo
    "renewal": 504,                // year 2+ (year 2/3 only separately, if different)
    "year2": null, "year3": null,
    "transfer_in": 504,
    "transfer_out": 0,
    "icann_fee_included": null     // gTLD only
  },
  "promo": { "conditions": "nur Neukunden", "valid_until": null },
  "contract": {
    "min_term_months": 12,
    "notice_period_days": 30,
    "billing_cycle": "yearly",     // monthly|yearly|multi-year
    "auto_renew_default": true,
    "price_change_notice": true    // price changes are announced in advance
  },
  "features": {
    "ssl_free": true,              // Let's Encrypt / certificate included
    "forward_301": true, "forward_302": true,
    "dns_editor": true,            // A/AAAA/CNAME/MX/TXT/SRV freely editable
    "custom_ns": true,
    "dnssec": true,
    "email_forwarding": false,
    "whois_privacy": "n/a",        // free|paid|none|n/a (none: not offered; .de: n/a)
    "api": true, "two_factor": true,
    "payment_methods": ["sepa", "paypal", "card"]
  },
  "evidence": {
    "source_url": "https://www.netcup.com/de/domains",
    "fetched_at": "2026-11-01T10:00:00Z",
    "method": "scrape",
    "evidence_hash": "sha256:…",
    "confidence": "high"           // high|medium|low (manual without evidence = low)
  },
  "provider_verified": false
}
```

**TCO calculation (library, tested):**
`sum_N = setup + year1 + Σ_{i=2..N} (year_i ?? renewal)`; `avg_N = sum_N / N`.
Gross/net via `vat_included` + the provider's `vat_rate` (DE 19 %). Foreign currency with the ECB daily rate + date.

### 3.3 Columns (table)

Mandatory (from the requirements): setup fee · year 1 · year 2 · year 3 · total/avg. 2 yrs · total/avg. 3 yrs · total/avg. 5 yrs · notice period · minimum term · free SSL · 301 · 302 · DNS editor · custom NS.

Also useful (can be shown/hidden, column selection in the URL): regular renewal price · transfer-in · transfer-out · billing cycle · auto-renew default · DNSSEC · e-mail forwarding · Whois privacy (gTLD) · API · 2FA · payment methods · gross/net toggle · data as of (fetched_at) · evidence link · „Anbieter-bestätigt“ ("provider-verified").

Deliberately **not**: reviews/stars (§ 5b Abs. 3), support quality (not measurable), "recommendation".

### 3.4 Architecture

```
GitHub repo (public) "tldcost"
├── data/            JSON (providers, offers, TLD metadata)          ← source of truth
├── scraper/         TypeScript, one adapter per provider, fixtures   ← GitHub Actions, daily
├── site/            Astro (static), table via TanStack Table         ← build on data change
└── docs/            methodology, changelog (generated from Git log)

GitHub Actions (cron 1×/day): scraper → schema validation → diff → commit (bot) → build → deploy
Hosting: S3 + CloudFront (CDK/TypeScript in the operator's AWS account), own domain
Public API: /api/v1/offers/<tld>.json and /api/v1/all.json = static files from the build
```

Why this way:
- **Scraper in GitHub Actions instead of Lambda:** The commit *is* the audit trail. No secret, no database, no operations. If a scraper fails, the last good state remains (data date visible).
- **Static:** vantage pattern, zero attack surface, cost close to zero, caching is trivial.
- **Astro instead of Next:** smaller, plain HTML + an island for the table; no server. (The owner can choose Next if reuse from chnet.domains is wanted.)
- **Data separate from code:** schema version in the JSON; site and scraper evolve independently.

### 3.5 Data collection strategy

| Tier | Source | Providers |
|---|---|---|
| A — API/structured price list | INWX (reseller API/price list), Porkbun, Dynadot (public price pages, machine-readable), Cloudflare Registrar (at-cost, table) | can be automated immediately |
| B — HTML scrape | netcup, Hetzner, united-domains (price list), checkdomain, All-Inkl, Strato, IONOS, DomainFactory, Host Europe, Contabo, one.com, Alfahosting | adapter with fixture tests; breakage = data stays at the old date + alert |
| C — manual with evidence | contract terms (AGB, general terms and conditions: minimum term, notice period, auto-renew), feature matrix | change rarely; `confidence` + `fetched_at`; review every 90 days via issue reminder |
| D — cross-check | tldes.com / TLDSpy API (paid, optional) | only for comparison, never as the primary source without our own source |

**Seed:** The existing internal market analysis + price list is taken over as the manual starting dataset (tier C), with sources added afterwards.

**Initial scope (MVP):** 10 DE providers + chnet.domains + 3 international references (Cloudflare, Porkbun, INWX) × 20 TLDs (.de .com .net .org .eu .io .dev .app .shop .info .at .ch .me .co .online .berlin .xyz .ai .biz .cloud).

### 3.6 UI (vantage style)

- Top: TLD selection (dropdown with search), gross/net, term focus (2/3/5 yrs), column selector. Everything in query parameters.
- Table: fixed first column (provider + badges „Betreiber“ ("operator"), „Anbieter-bestätigt“ ("provider-verified"), „Aktionspreis“ ("promotional price")), sortable, dense rows, numbers right-aligned, footnotes per cell (promo condition, net notice) as tooltip + footnote list.
- Expand a row: evidence link, fetched_at, price history (sparkline from Git history), quoted AGB passage.
- Pages: `/` (table), `/methodik`, `/anbieter/<id>`, `/tld/<tld>` (SEO: one static page per TLD), `/changelog`, `/api`, `/impressum`, `/datenschutz`.
- Language: DE first, EN toggle (TLD pages are an SEO lever in both languages).

## 4. Review board: findings and resolution

| # | Role | Sev. | Finding | Resolution |
|---|---|---|---|---|
| 1 | Skeptic | **blocker** | Operator is itself a provider → credibility risk, possibly a UWG attack surface for competitors | § 3.1 points 1–5; owner decision Q2 (list with badge vs. exclude); the Impressum names the relationship; make highlighting technically impossible (sort order purely data-driven, tests check this) |
| 2 | Skeptic | **major** | Scrapers break silently; wrong prices are worse than old ones | schema validation + plausibility rules (Δ > 30 % ⇒ commit blocked, issue); `fetched_at` visible; alert when older than 7 days |
| 3 | Senior Dev | **major** | "from" prices, promos, monthly prices×12, net/gross, foreign currency → comparison becomes wrong | normalisation in the TCO lib with unit tests per case; `year1` vs. `year1_regular`; promo conditions as footnote; gross default |
| 4 | Security | major | GitHub Actions supply chain (bot commits, pinning actions), PR spam through "provider PRs" | pin actions by SHA; bot has write access only to `data/`; PRs only with `source_url`, CODEOWNERS = operator; branch protection |
| 5 | Security | minor | Scraping targets could block us or send cease-and-desist letters | only public price pages, robots.txt, 1×/day, UA with contact; adapters can be disabled; the methodology page explains it |
| 6 | Architect | major | Mixing site/scraper/data leads to a monolith | folder structure § 3.4, schema version, site reads only `data/` |
| 7 | FinOps | minor | Cost | GitHub Actions (public repo) 0 €, S3+CloudFront < 1 €/month, domain; tldes/TLDSpy API optional later |
| 8 | Skeptic | major | Maintenance of tier C data (AGB) gets orphaned | 90-day reminder issue per provider (Action); field `reviewed_at`; table shows age |
| 9 | Senior Dev | minor | Table UX on mobile | horizontal scrolling with fixed provider column; column selector with a mobile default (5 columns) |
| 10 | Architect | minor | Public API without guarantees | `/api/v1` static, CORS *, schema version, "best effort" documented |

Blockers/majors are resolved in the concept; implementation is anchored in the issues.

## 5. Cost & operations

- Running costs: domain (~10 €/yr), S3/CloudFront (< 1 €/month), GitHub (public: 0 €). Optional tldes API later.
- Operations: no servers, no database. Maintenance effort = scraper adapters when pages change + 90-day AGB review.
- Rollback: data = Git → `git revert`; site = previous build in S3 (versioned bucket).

## 6. Risks & open points

- Reach: without affiliate income there is no marketing budget; levers = SEO via `/tld/<tld>` pages + open-data reputation (Hacker News/r/webhosting pattern as with vantage).
- Legal: the concept follows UWG/PAngV logic, but before launch a **short legal review** of the Methodik/Impressum page and of the operator badge is needed (issue in the milestone).
- Separation from chnet.domains: the portal must not be "read" as a lead channel → own brand/domain (Q1), no cross-linking except the Impressum and the regular row.

## 7. Owner decisions (before implementation)

| | Question | Recommendation |
|---|---|---|
| Q1 | Brand/domain | neutral, own domain; Impressum CHnet Solutions Plus UG |
| Q2 | List chnet.domains (with badge) or exclude it? | list with badge — exclusion would itself be intransparent and would give up the proof "we measure ourselves by the same standard" |
| Q3 | Repo public from day 1 (open data) or only from launch? | public from day 1 (Git history = proof of trust) |
| Q4 | Hosting: AWS S3/CloudFront via CDK (the operator's existing standard) vs. Cloudflare Pages | AWS/CDK (existing internal CDK patterns); Cloudflare as fallback |
| Q5 | Site framework: Astro (recommended) vs. Next.js | Astro |
| Q6 | Funding: none / donations / labelled sponsoring outside the table | none for now; decide after 6 months of traffic |
| Q7 | Own repo or a subfolder in a separate infrastructure repository? | **own public repo** (the infrastructure repository stays private) |

## 8. Test strategy

- TCO lib: unit tests (promo, monthly price, net/gross, foreign currency, different year 2/3 prices, missing values).
- Scraper: fixture HTML per adapter, snapshot tests; plausibility gate; dry run in PRs.
- Schema: JSON Schema + CI validation of all `data/` files.
- Site: Playwright. Sorting is deterministic and URL-driven; the operator row is never preferred (explicit test: sorting by every column gives the same order with and without the badge field).
- a11y: table with `<th scope>`, keyboard sorting, contrast.

## 9. Milestone draft "tldcost MVP"

| # | Issue | Scope (short form) |
|---|---|---|
| 1 | Record owner decisions Q1–Q7 | decisions in `docs/decisions.md`; create repo + domain |
| 2 | Data schema + TCO library | JSON Schema (§ 3.2), `packages/core` with `computeTco()`, net/gross, currency; 100 % tests |
| 3 | Seed dataset | migrate the internal market analysis to `data/`, every number with `source_url`+`fetched_at`, `confidence` |
| 4 | Provider metadata + AGB collection | `data/providers/*.json` with minimum term, notice period, billing, AGB reference; 90-day `reviewed_at` |
| 5 | Site skeleton (Astro) | layout, TLD selector, table (TanStack), sorting/columns/gross-net in the URL, mobile |
| 6 | Row detail + footnotes | evidence link, data date, promo conditions, badges „Betreiber“/„bestätigt“/„Aktion“ ("operator"/"verified"/"promotion") |
| 7 | Mandatory pages | Methodik (§ 5b UWG), Impressum incl. conflict of interest, Datenschutz (privacy policy), changelog (from Git log) |
| 8 | Scraper framework + 3 adapters | adapter interface, fixtures, plausibility gate; adapters Porkbun, INWX, netcup |
| 9 | GitHub Actions | daily scrape → validate → diff → bot commit → build; actions pinned by SHA; alerts |
| 10 | Infra (CDK) | S3 (versioned) + CloudFront + ACM + Route 53 in the operator's AWS account; deploy from Actions via OIDC |
| 11 | Public API + `/tld/<tld>` pages | static JSON endpoints, OpenAPI file, SEO pages per TLD DE/EN |
| 12 | Correction workflow | issue template „Preis falsch“ ("price wrong"), PR template for providers, CODEOWNERS, branch protection |
| 13 | Launch checklist | short legal check of Methodik/Impressum, Lighthouse, OG images, announcement |

**After MVP (backlog):** more adapters (IONOS, Strato, All-Inkl, Hetzner, united-domains, …), price history charts, tldes/TLDSpy cross-check, notification „Preis meiner TLD hat sich geändert“ ("the price of my TLD has changed") (RSS/Atom, no e-mail login), comparison of web hosting packages (only with the same transparency rules).
