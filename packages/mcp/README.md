# @tldcost/mcp

An [MCP](https://modelcontextprotocol.io/) server (stdio) that gives AI assistants the public
domain price data of [tldcost.io](https://tldcost.io/): which providers offer a TLD, what it costs
over N years, and the providers' contract terms. It reads only the public, static JSON API
(`https://tldcost.io/api/v1/`, documented at https://tldcost.io/api/). No account, no key, no
backend of its own.

> Status: in the repo only, not yet published to npm. Until then, run it from a checkout (below).

## Tools

| Tool | Input | Output |
| --- | --- | --- |
| `list_tlds` | – | TLDs with the number of offers, data date |
| `get_offers` | `tld`, optional `years` (1–10, default 3), `vat` (`gross` default / `net`) | every offer for the TLD: raw provider price (currency, unit, cents), total cost over `years` in EUR, promo flag and conditions, source URL and fetch date |
| `compare` | `tld`, optional `years`, `vat`, `providers[]`, `sort` (`total` default / `year1` / `provider`) | the offers sorted by total cost (or first-year payment, or provider id), lowest first |
| `get_provider` | `provider` (id, e.g. `inwx`) | country, VAT rate, contract terms (minimum term, notice period, billing cycle, auto-renew), and per TLD offer the effective contract values and features (`true`, `false`, `"paid"` or `null`; `feature_costs` with source and stated price of paid features) |
| `basket` | `basket` (list of `{tld, count}`, up to 20 TLDs), optional `years`, `vat`, `mode` (`new` default / `transfer`) | cost of the whole portfolio per provider, lowest total first, with every line and the reason where a provider has no total; promo limits and transfer rules as notes; the lowest subtotal per TLD across providers (mix) |

The total cost is computed by `@tldcost/core` (`computeTco`; `computeBasket` for `basket`), the
same functions behind the tldcost.io table, the portfolio calculator and the API's `derived`
block: monthly prices are annualised (× 12), other currencies converted at the ECB rate the API
names, VAT added or removed with the provider's rate
([Methodik](https://tldcost.io/methodik/)).

Every answer carries a `source` block: the API URL, `data_version`, `data_updated` (newest price
fetch date), the time this server fetched the document, and the data license. Each offer carries
its own `source_url` and `fetched_at`.

**Neutrality:** results are sorted by price, never rated; there is no "best" or "recommended".
The portal operator's own offer (chnet.domains) is marked `operator: true` and sorted like any
other.

## Use it

Requires Node.js 24 or newer.

From a checkout of this repository:

```sh
npm ci
npm run build -w @tldcost/mcp
```

Claude Code:

```sh
claude mcp add tldcost -- node /path/to/tldcost/packages/mcp/dist/cli.js
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "tldcost": {
      "command": "node",
      "args": ["/path/to/tldcost/packages/mcp/dist/cli.js"]
    }
  }
}
```

Once the package is published, `npx -y @tldcost/mcp` replaces `node …/dist/cli.js`. The package
installs the command `tldcost-mcp`.

`TLDCOST_API_URL` overrides the API base URL (default `https://tldcost.io/api/v1`), e.g. for a
local site build.

## Behaviour

- Read only: HTTP GET on the public API, User-Agent `tldcost-mcp (+https://github.com/chnet/tldcost)`,
  no cookies, no personal data, 15 s timeout.
- Responses are cached in memory for one hour. When a response shows a new `data_version`, all
  cached documents are dropped, so one answer never mixes two data versions.
- Wrong input and API failures come back as MCP tool errors, not as crashes.
- Logs go to stderr; stdout carries the protocol.

## Development

```sh
npm test -w @tldcost/mcp     # vitest, 100 % coverage, fixtures only (no live calls)
npx tsx packages/mcp/scripts/make-fixtures.ts   # regenerate test/fixtures/ from data/ (repo root)
```

The fixtures are API documents built from `data/` by the site's own API code. `test/contract.test.ts`
checks them against the served record schemas (`schema/*.schema.json`) and against the shape the
site builds today. `test/cli.test.ts` runs the CLI as a child process over stdio against a local
HTTP server.

Dependency: the official [`@modelcontextprotocol/sdk`](https://www.npmjs.com/package/@modelcontextprotocol/sdk),
pinned to an exact version. Only its stdio server transport is imported.

## Privacy, license, security

- **No telemetry.** The server sends no usage data, analytics or crash reports anywhere. Its only
  network traffic is the HTTP GET requests to the tldcost API described above, without cookies or
  personal data.
- **Data license:** the price data is open data under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Every answer carries a `license` block
  with the attribution to use („Quelle: tldcost.io (CHnet Solutions Plus UG), CC BY 4.0“); keep it
  when you pass the data on.
- **Code license and no warranty:** the code is licensed under Apache-2.0 (see the repository's
  `LICENSE` and `NOTICE`) and provided "AS IS", without warranties or conditions of any kind
  (Apache-2.0, section 7). Prices can be out of date or wrong; check the provider's page
  (`source_url`) before you order.
- **Security:** report vulnerabilities as described in [SECURITY.md](../../SECURITY.md) (private
  vulnerability reporting or e-mail, not a public issue). Its response times apply to this package
  too: acknowledgement within 5 working days, first assessment within 10 working days.
