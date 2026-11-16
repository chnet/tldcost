<!--
Thank you for contributing. Changes to data/ are accepted only with a public source.
Code or docs change only: delete the sections "Data" and "Connection to the provider".
Rules: .github/CONTRIBUTING.md
Deutsch ist auch willkommen.
-->

## What changes?

Closes #

## Type of change

- [ ] Data correction (price, contract term, feature)
- [ ] New provider or TLD data
- [ ] Code (`scraper/`, `site/`, tooling)
- [ ] Docs

## Data (required for changes in `data/`)

| Provider | TLD | Field | Old | New | Source (`source_url`) | Checked on |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

- [ ] Every changed value has a public source in `evidence.source_url` that can be opened without logging in.
- [ ] `evidence.fetched_at` is the time I checked the source.
- [ ] `evidence.method` is set (`manual` for manual entry).
- [ ] Gross/net is right (`vat_included`).
- [ ] Promotional prices: `year1` with the promotion, `year1_regular` without, conditions in `promo.conditions`.

## Connection to the provider (required for changes in `data/`)

- [ ] I have no connection to any affected provider.
- [ ] I work for the provider or act on its behalf. Provider:

Provider pull requests are checked under the same rules as all others: no public source, no change.
Please do not change `provider_verified` yourself. The maintainers set this field after checking that you belong to the provider.
