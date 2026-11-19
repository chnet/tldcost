# tldcost

Transparent, verifiable price comparison for domain registrations (focus on Germany).
A plain table in the style of instances.vantage.sh: pick a TLD, one provider per row,
the real total cost over 2/3/5 years plus the contract terms.

**Principles**
- Open data: all prices are JSON files in `data/`, every value with source, timestamp and evidence hash. The Git history since publication on 19 November 2026 is the audit trail; earlier changes are in the private predecessor repository (Archiv-Issues).
- No affiliate links, no tracking, no ratings, no "test winner".
- Sorting is the user's choice and lives in the URL. Default: total cost over 3 years (see the methodology page).
- Operator: CHnet Solutions Plus UG, which also sells domains itself under chnet.domains. That offer is listed as a normal row with a visible badge: same data collection, same rules.

The site itself is in German. Contributions, issues and pull requests are welcome in English or German.

Verweise „Archiv-Issue NN“ beziehen sich auf das private Vorgänger-Repository. (References "Archiv-Issue NN" and "archive issue NN" point to issues and pull requests of the private predecessor repository.)

Concept: [`docs/concepts/tldcost.md`](docs/concepts/tldcost.md) · Decisions: [`docs/decisions.md`](docs/decisions.md)

## Development

Monorepo (npm workspaces): `packages/*`, `site`, `scraper`, `infra`. Node ≥ 24 (`.nvmrc`).

```sh
npm ci
npm run validate   # lint, Prettier, TypeScript (tsc -b), schema validation of data/
npm test           # vitest per workspace + node:test for scripts/
```

- `schema/`: JSON Schema for providers (`provider.schema.json`), offers (`offer.schema.json`), ECB rates (`fx.schema.json`) and price histories (`history.schema.json`); examples in `schema/examples/`. Amounts are integer cents, VAT rates are basis points (1900 = 19 %).
- `packages/core`: types, `normalizePrice()`, `computeTco()` (sum/average over N years, net/gross, foreign currency with the ECB rate); `@tldcost/core/load` reads `data/`.
- `data/`: `providers/<id>.json`, `offers/<provider>/<tld>.json`, `fx/<ECB date>.json`, `history/<provider>/<tld>.json` (price history per offer: one entry per price change, `npm run history:sync`); CI checks every file against the schema.
- Workspaces extend `tsconfig.base.json` and `eslint.base.js` instead of changing root files.
- Commit identity: only addresses from `config/chnet-commit-emails.txt` (pre-push hook and CI).

Status: live at https://tldcost.io since 14 November 2026. Data is updated weekly; the repository is open data (CC BY 4.0) and code (Apache-2.0).

## Security

See [`SECURITY.md`](SECURITY.md) for how to report a vulnerability.

## License

- **Code:** [Apache License 2.0](LICENSE), Copyright 2026 CHnet Solutions Plus UG (haftungsbeschränkt), see [`NOTICE`](NOTICE).
- **Data** in `data/` and the API at `https://tldcost.io/api/v1/`: [CC BY 4.0](data/LICENSE).
  Attribution, for example: "Source: tldcost.io (CHnet Solutions Plus UG), CC BY 4.0" with a link to
  https://tldcost.io/ and https://creativecommons.org/licenses/by/4.0/.
