// OpenAPI 3.1 description of /api/v1/. Built at build time so the TLD list matches the
// generated files. Schemas are JSON Schema 2020-12 (the OpenAPI 3.1 dialect); the raw records
// reference the schema files served under /api/v1/schema/, which are copies of schema/*.json.
import { API_PATH, DATA_LICENSE, SITE_ORIGIN, schemaPath, type SchemaName } from './api';
import { repoLink } from './report.mjs';

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const external = (name: SchemaName) => ({ $ref: `${SITE_ORIGIN}${schemaPath(name)}` });
/** A derived amount: EUR cents, monthly prices annualised (x 12), other currencies converted. */
const cents = (what: string) => ({
  type: ['integer', 'null'],
  minimum: 0,
  description: `${what}. EUR cents; monthly prices are annualised (x 12), other currencies converted with the ECB rate.`,
});
const timestamp = { type: ['string', 'null'], format: 'date-time' };

const NOT_FOUND = {
  description:
    'Unknown path. Served by the CDN as the HTML page /404.html (text/html), not as JSON. ' +
    'Applies to the whole site, so clients should check the status code before parsing.',
  content: { 'text/html': { schema: { type: 'string' } } },
};

const json = (schema: object, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

/** Response schema with the shared meta fields and no other properties than listed. */
const doc = (properties: Record<string, object>, required: string[]) => ({
  allOf: [ref('Meta')],
  type: 'object',
  properties,
  required,
  unevaluatedProperties: false,
});

export function buildOpenApi(tlds: readonly string[]) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'tldcost API',
      version: '1',
      summary: 'Domain prices (registration, renewal, transfer) with contract terms, as open data.',
      description: [
        'Static, read-only JSON files, regenerated with every data change. No authentication, no',
        'cookies, no query parameters, no rate limit beyond what the CDN applies. CORS allows any',
        'origin (GET/HEAD). Best effort, no SLA.',
        '',
        '`providers`, `offers` and `fx` are the raw records from the repository (schemas under',
        '/api/v1/schema/). Amounts there are integer cents in the offer currency, and the',
        'recurring amounts (`price.year1`, `year1_regular`, `renewal`, `year2`, `year3`) are per',
        '`price.unit`: per year for "year", per MONTH for "month". `price.setup` and the transfer',
        'amounts are one-off. `vat_included` says whether VAT is included.',
        '',
        '`derived` holds values computed from the raw records with the same code as the website.',
        '`derived.tco` is always in EUR cents, gross and net, with monthly prices annualised',
        '(multiplied by 12) and other currencies converted with the ECB rate (`fx`). `setup` is',
        'one-off, `sum_Ny` is the total over N years, `avg_Ny` the average per year. The raw',
        'records are authoritative.',
        '',
        'Example: an offer with `price.unit: "month"`, `price.year1: 42` and `vat_included: true`',
        'costs 0.42 EUR per month incl. VAT, i.e. 5.04 EUR per year; its `derived.tco[...].gross`',
        'has `avg_3y: 504` and `sum_3y: 1512` (without setup fee).',
        '',
        'Versioning: v1 changes only additively (new fields, new files). A breaking change gets',
        'a new path (/api/v2/). `data_version` changes exactly when the data changes. Each raw',
        'record carries its own `schema_version`; the meta field `schema_version` is the version',
        'of the schema set.',
        '',
        'Exception (2026-11-15): schema set 2 widens the yes/no feature fields under /api/v1/.',
        'v1 had been live for one day, before broad adoption; `schema_version` 2 signals the',
        'change. From now on, breaking changes only via /api/v2/.',
        '',
        'Change 2026-11-15: features.* can now be "paid"; schema_version 2.',
        '',
        'Schema set 2 (offer records schema_version 2): the yes/no feature fields `ssl_free`,',
        '`forward_301`, `forward_302`, `dns_editor`, `custom_ns`, `dnssec`, `email_forwarding` and',
        '`api` may also be "paid" (offered only for a fee). The new optional `feature_costs` holds,',
        'per paid feature, `source` (`url`, the verbatim `quote` and its `lang`, de or en, default',
        'de) and, only where the provider names them, `price_cents` (offer currency, offer VAT',
        'mode), `unit` (year, month, once) and a short German `note`. `whois_privacy` keeps its',
        'enum; its "paid" needs a `feature_costs` entry too.',
        '',
        `License: the data is licensed under ${DATA_LICENSE.name} (${DATA_LICENSE.url}). Attribution,`,
        `for example: "${DATA_LICENSE.attribution}". The code of tldcost is licensed under the`,
        `Apache License 2.0 (${repoLink('', `${SITE_ORIGIN}/lizenz/`)}).`,
      ].join('\n'),
      license: { name: DATA_LICENSE.name, url: DATA_LICENSE.url },
    },
    externalDocs: { description: 'Human-readable documentation', url: `${SITE_ORIGIN}/api/` },
    servers: [{ url: `${SITE_ORIGIN}${API_PATH}` }],
    paths: {
      '/all.json': {
        get: {
          operationId: 'getAll',
          summary: 'All providers, offers and FX tables, with derived TCO values',
          responses: { '200': json(ref('AllResponse'), 'All data'), '404': NOT_FOUND },
        },
      },
      '/tlds.json': {
        get: {
          operationId: 'getTlds',
          summary: 'TLDs with at least one offer, with links to their files',
          responses: { '200': json(ref('TldsResponse'), 'TLD index'), '404': NOT_FOUND },
        },
      },
      '/offers/{tld}.json': {
        get: {
          operationId: 'getOffersByTld',
          summary: 'Offers for one TLD, the providers behind them and derived TCO values',
          parameters: [
            {
              name: 'tld',
              in: 'path',
              required: true,
              description: 'TLD without the dot, e.g. `de`.',
              schema: { type: 'string', enum: [...tlds] },
            },
          ],
          responses: { '200': json(ref('TldResponse'), 'Offers for the TLD'), '404': NOT_FOUND },
        },
      },
      '/openapi.json': {
        get: {
          operationId: 'getOpenApi',
          summary: 'This document',
          responses: { '200': json({ type: 'object' }, 'OpenAPI 3.1 document'), '404': NOT_FOUND },
        },
      },
      '/schema/{name}.schema.json': {
        get: {
          operationId: 'getSchema',
          summary: 'JSON Schema (2020-12) of the raw records',
          parameters: [
            {
              name: 'name',
              in: 'path',
              required: true,
              schema: { type: 'string', enum: ['offer', 'provider', 'fx'] },
            },
          ],
          responses: { '200': json({ type: 'object' }, 'JSON Schema'), '404': NOT_FOUND },
        },
      },
    },
    components: {
      schemas: {
        Meta: {
          type: 'object',
          properties: {
            api_version: { const: 1 },
            schema_version: {
              const: 2,
              description:
                'Version of the schema set: the newest record schema_version (offers 2, providers and fx 1).',
            },
            data_version: {
              type: 'string',
              pattern: '^sha256:[0-9a-f]{64}$',
              description: 'Hash of the loaded data; changes exactly when the data changes.',
            },
            data_updated: {
              ...timestamp,
              description: 'Newest evidence.fetched_at of the offers in this file.',
            },
            data_oldest: {
              ...timestamp,
              description: 'Oldest evidence.fetched_at of the offers in this file.',
            },
            documentation: { type: 'string', format: 'uri' },
            license: {
              type: 'object',
              description:
                'License of the data in this file and the attribution to use. Fixed for v1: a ' +
                'change of the data license would come with a new path (/api/v2/).',
              // const on purpose (docs/decisions.md, 2026-11-16): v1 clients may rely on the license
              properties: {
                name: { const: DATA_LICENSE.name },
                spdx: { const: DATA_LICENSE.spdx },
                url: { const: DATA_LICENSE.url },
                attribution: { type: 'string', minLength: 1 },
              },
              required: ['name', 'spdx', 'url', 'attribution'],
              additionalProperties: false,
            },
          },
          required: [
            'api_version',
            'schema_version',
            'data_version',
            'data_updated',
            'data_oldest',
            'documentation',
            'license',
          ],
        },
        DerivedTcoMode: {
          type: 'object',
          properties: {
            setup: cents('One-off setup fee'),
            sum_2y: cents('Total over 2 years (setup and every payment due, each in full)'),
            avg_2y: cents('Average per year over 2 years'),
            sum_3y: cents('Total over 3 years (setup and every payment due, each in full)'),
            avg_3y: cents('Average per year over 3 years'),
            sum_5y: cents('Total over 5 years (setup and every payment due, each in full)'),
            avg_5y: cents('Average per year over 5 years'),
            missing: {
              type: 'array',
              items: { type: 'string' },
              description: 'Missing inputs (e.g. price.renewal, vat_rate, fx.USD); sums are null.',
            },
          },
          required: [
            'setup',
            'sum_2y',
            'avg_2y',
            'sum_3y',
            'avg_3y',
            'sum_5y',
            'avg_5y',
            'missing',
          ],
          additionalProperties: false,
        },
        DerivedOffer: {
          type: 'object',
          properties: {
            currency: { const: 'EUR' },
            fx: {
              description: 'ECB reference rate used for a non-EUR offer.',
              oneOf: [
                { type: 'null' },
                {
                  type: 'object',
                  properties: {
                    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
                    date: { type: 'string', format: 'date' },
                    per_eur: { type: 'number', exclusiveMinimum: 0 },
                  },
                  required: ['currency', 'date', 'per_eur'],
                  additionalProperties: false,
                },
              ],
            },
            vat_not_stated: { type: 'boolean' },
            gross: ref('DerivedTcoMode'),
            net: ref('DerivedTcoMode'),
          },
          required: ['currency', 'fx', 'vat_not_stated', 'gross', 'net'],
          additionalProperties: false,
        },
        Derived: {
          type: 'object',
          description:
            'Values computed from the raw records; the raw records are authoritative. EUR cents, ' +
            'monthly prices annualised (x 12), other currencies converted with the ECB rate.',
          properties: {
            description: { type: 'string' },
            tco: {
              type: 'object',
              description: 'Key `<provider>/<tld>`, one entry per offer.',
              propertyNames: { pattern: '^[a-z0-9-]+/[a-z0-9-]+$' },
              additionalProperties: ref('DerivedOffer'),
            },
          },
          required: ['description', 'tco'],
          additionalProperties: false,
        },
        AllResponse: doc(
          {
            providers: { type: 'array', items: external('provider') },
            offers: { type: 'array', items: external('offer') },
            fx: { type: 'array', items: external('fx') },
            derived: ref('Derived'),
          },
          ['providers', 'offers', 'fx', 'derived'],
        ),
        TldResponse: doc(
          {
            tld: { type: 'string' },
            providers: { type: 'array', items: external('provider') },
            offers: { type: 'array', items: external('offer') },
            derived: ref('Derived'),
          },
          ['tld', 'providers', 'offers', 'derived'],
        ),
        TldsResponse: doc(
          {
            tlds: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tld: { type: 'string' },
                  offers: { type: 'integer', minimum: 1 },
                  href: { type: 'string', description: 'Path of the TLD file under this origin.' },
                  page: { type: 'string', description: 'Path of the TLD page on the website.' },
                },
                required: ['tld', 'offers', 'href', 'page'],
                additionalProperties: false,
              },
            },
          },
          ['tlds'],
        ),
      },
    },
  };
}
