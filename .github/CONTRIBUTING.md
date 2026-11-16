# Contributing to tldcost

tldcost is an open dataset. Every number must be verifiable. That is why the same rules apply to all contributions, including those from providers and from the operator.

Contributions are welcome in English or German. (Deutsch ist auch willkommen.)

## Report an error

Use "Fehler melden" (report an error) in the table row, or open the form [Price or detail wrong](https://github.com/chnet/tldcost/issues/new?template=preis-falsch.yml) directly.
A public source is required: a page of the provider that can be opened without logging in.

## Contribute data with a pull request

1. Fork the repository and change the matching file:
   - prices per TLD: `data/offers/<provider>/<tld>.json`
   - the provider's contract terms (minimum term, notice period, billing, where the terms say so): `data/providers/<provider>.json`
2. For every changed value, update `evidence`: `source_url`, `fetched_at`, `method`.
   After a price change, run `npm run history:sync`: it adds the entry to the price history in `data/history/<provider>/<tld>.json` (CI checks that it matches the offer).
3. Open a pull request and fill in the template.

Rules:

- **No public source, no change.** Statements like "we confirm the price to you by e-mail" are not enough.
- **Disclose your connection.** If you work for a provider or act on its behalf, say so in the pull request.
- **Do not set `provider_verified` yourself.** The maintainers set this field after checking that you belong to the provider.
- Provider pull requests do not change other providers' data.
- **The operator's own offer (chnet.domains):** changes to this data are made only through a public pull request with a public source, under the same rules as for every other provider. The pull request has "Connection to the provider" ticked.

## Protection of `main`

- `main` is protected by the organisation ruleset `main-protection`: changes only through pull requests, no force push, no deleting the branch.
- [`CODEOWNERS`](CODEOWNERS) requests the reviews.
- CI checks the data (schema, mandatory `source_url`) on every pull request.

## Security issues

Do not open a public issue for a vulnerability. See [`SECURITY.md`](../SECURITY.md).
