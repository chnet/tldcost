# Security policy

tldcost is a static website with an open dataset and a read-only JSON API. It has no user accounts, no login and no server-side application. Still, we want to hear about anything that could affect visitors, the data or the infrastructure, for example in the build and deploy workflows, the scraper or the site's security headers.

## How to report

Please do **not** open a public issue for a vulnerability.

- **Preferred:** GitHub private vulnerability reporting: the "Report a vulnerability" button on the [Security tab](https://github.com/chnet/tldcost/security/advisories/new) of this repository.
- **Or by e-mail:** [privacy@chnet.solutions](mailto:privacy@chnet.solutions).

Please include what you found, where (URL, file or workflow), how to reproduce it, and the impact you expect. English or German is fine.

## What to expect

- We aim to acknowledge reports within 5 working days and to give a first assessment within 10 working days.
- We keep you informed until the issue is fixed.
- We will credit you in the advisory if you wish.

There is **no bug bounty** programme.

## Scope

In scope: this repository (code, workflows, data pipeline), the site and API at https://tldcost.io/, and the MCP server package in [`packages/mcp`](packages/mcp/) (planned npm name `@tldcost/mcp`). The response times above apply to the package as well.

Out of scope: the providers' own websites listed in the data, social engineering, denial-of-service tests, and findings from automated scanners without a demonstrated impact.

Please test only against your own copies, do not access other people's data, and give us reasonable time to fix an issue before you disclose it.
