import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from '@tldcost/core/load';
import { describe, expect, it } from 'vitest';
import {
  buildAll,
  buildTld,
  buildTlds,
  DATA_LICENSE,
  dataVersion,
  deriveTco,
  SCHEMA_NAMES,
  servedSchema,
  apiTlds,
  type SchemaName,
} from '../../src/lib/api';
import { buildOpenApi } from '../../src/lib/openapi';
import { buildPayload } from '../../src/lib/rows';
import { payloadForTld } from '../../src/lib/tld-payload';
import { sitemapUrls, sitemapXml } from '../../integrations/sitemap.mjs';
import { responseValidator, validateOpenApi } from '../api-validator.mjs';

const FIXTURES = fileURLToPath(new URL('../fixtures/data', import.meta.url));
const data = loadData(FIXTURES);
const payload = buildPayload(data);
const schemas = SCHEMA_NAMES.map((name: SchemaName) =>
  servedSchema(
    JSON.parse(
      readFileSync(new URL(`../../../schema/${name}.schema.json`, import.meta.url), 'utf8'),
    ),
    name,
  ),
);
const openapi = buildOpenApi(apiTlds(data));
const validate = responseValidator(openapi, schemas);

describe('API documents', () => {
  it('all.json carries the raw data unchanged', () => {
    const all = buildAll(data);
    expect(all.providers).toEqual(data.providers);
    expect(all.offers).toEqual(data.offers);
    expect(all.fx).toEqual(data.fx);
  });

  it('derived TCO equals the table values for every offer and VAT mode (same code path)', () => {
    const all = buildAll(data);
    expect(Object.keys(all.derived.tco).sort()).toEqual(payload.rows.map((r) => r.key).sort());
    for (const row of payload.rows) {
      const d = all.derived.tco[row.key];
      expect(d, row.key).toBeDefined();
      for (const mode of ['gross', 'net'] as const) {
        for (const k of ['sum_2y', 'avg_2y', 'sum_3y', 'avg_3y', 'sum_5y', 'avg_5y', 'setup']) {
          expect(d?.[mode][k as 'sum_3y'], `${row.key} ${mode} ${k}`).toBe(row[mode][k] ?? null);
        }
      }
    }
  });

  it('converts non-EUR offers with the ECB rate and states it', () => {
    const usd = data.offers.filter((o) => o.currency !== 'EUR');
    expect(usd.length).toBeGreaterThan(0);
    const all = buildAll(data);
    for (const o of usd) {
      const d = all.derived.tco[`${o.provider}/${o.tld}`];
      expect(d?.fx?.currency).toBe(o.currency);
      expect(d?.fx?.per_eur).toBeGreaterThan(0);
      expect(d?.gross.sum_3y).not.toBeNull();
    }
  });

  it('offers/<tld>.json holds only that TLD and the providers behind it', () => {
    for (const tld of apiTlds(data)) {
      const doc = buildTld(data, tld);
      const offers = data.offers.filter((o) => o.tld === tld);
      expect(doc.offers).toEqual(offers);
      expect(doc.providers.map((p) => p.id)).toEqual(
        [...new Set(offers.map((o) => o.provider))].sort(),
      );
      expect(Object.keys(doc.derived.tco).sort()).toEqual(
        offers.map((o) => `${o.provider}/${o.tld}`).sort(),
      );
    }
  });

  it('data_updated and data_oldest are the newest and oldest fetched_at of the document', () => {
    const doc = buildTld(data, 'de');
    const times = data.offers.filter((o) => o.tld === 'de').map((o) => o.evidence.fetched_at);
    const ms = times.map((t) => Date.parse(t));
    expect(Date.parse(doc.data_updated ?? '')).toBe(Math.max(...ms));
    expect(Date.parse(doc.data_oldest ?? '')).toBe(Math.min(...ms));
    const empty = buildAll({ providers: [], offers: [], fx: [] });
    expect([empty.data_updated, empty.data_oldest]).toEqual([null, null]);
  });

  it('data_version is stable and changes exactly when the data changes', () => {
    expect(dataVersion(loadData(FIXTURES))).toBe(dataVersion(data));
    expect(buildTld(data, 'de').data_version).toBe(buildAll(data).data_version);
    const changed = structuredClone(data);
    const first = changed.offers[0];
    if (!first) throw new Error('fixtures have no offers');
    first.price.renewal = (first.price.renewal ?? 0) + 1;
    expect(dataVersion(changed)).not.toBe(dataVersion(data));
  });

  it('every document names the data license (CC BY 4.0) and the attribution', () => {
    expect(DATA_LICENSE).toEqual({
      name: 'CC BY 4.0',
      spdx: 'CC-BY-4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      attribution: 'Quelle: tldcost.io (CHnet Solutions Plus UG), CC BY 4.0',
    });
    for (const doc of [buildAll(data), buildTlds(data), buildTld(data, 'de')]) {
      expect(doc.license).toEqual(DATA_LICENSE);
    }
  });

  it('tlds.json lists every TLD in display order with its offer count', () => {
    const doc = buildTlds(data);
    expect(doc.tlds.map((t) => t.tld)).toEqual(payload.tlds);
    expect(doc.tlds.reduce((n, t) => n + t.offers, 0)).toBe(data.offers.length);
    expect(doc.tlds[0]).toMatchObject({ href: '/api/v1/offers/de.json', page: '/tld/de/' });
  });
});

describe('documented price unit example (/api/, openapi.json)', () => {
  it('a monthly price of 42 cents incl. VAT is 504 cents per year in derived.tco', () => {
    const base = data.offers.find((o) => o.currency === 'EUR' && o.vat_included === true);
    if (!base) throw new Error('fixtures have no EUR offer with VAT included');
    const offer = structuredClone(base);
    offer.price = { ...offer.price, unit: 'month', setup: 0, year1: 42, renewal: 42 };
    delete offer.price.year2;
    delete offer.price.year3;
    const d = deriveTco(data, [offer]).tco[`${offer.provider}/${offer.tld}`];
    expect(d?.gross).toMatchObject({ setup: 0, avg_3y: 504, sum_3y: 1512, missing: [] });
  });

  it('the docs state the unit rule and how derived.tco is annualised', () => {
    const text = openapi.info.description;
    expect(text).toContain('per MONTH for "month"');
    expect(text).toContain('with monthly prices annualised');
    expect(text).toContain(
      '`setup` is\none-off, `sum_Ny` is the total over N years, `avg_Ny` the average per year',
    );
    const tco = openapi.components.schemas.DerivedTcoMode.properties;
    expect(tco.setup.description).toMatch(/^One-off/);
    expect(tco.sum_3y.description).toMatch(/^Total over 3 years/);
    expect(tco.avg_3y.description).toMatch(/^Average per year/);
    expect(text).toContain('`avg_3y: 504` and `sum_3y: 1512`');
  });
});

describe('OpenAPI', () => {
  it('is a valid OpenAPI 3.1 document', () => {
    expect(validateOpenApi(openapi)).toEqual([]);
  });

  it('describes every generated document', () => {
    expect(validate('AllResponse', buildAll(data))).toEqual([]);
    expect(validate('TldsResponse', buildTlds(data))).toEqual([]);
    for (const tld of apiTlds(data)) {
      expect(validate('TldResponse', buildTld(data, tld)), tld).toEqual([]);
    }
  });

  it('states the data license in info.license and requires it in every document', () => {
    expect(openapi.info.license).toEqual({ name: 'CC BY 4.0', url: DATA_LICENSE.url });
    const all = structuredClone(buildAll(data)) as unknown as Record<string, unknown>;
    delete all.license;
    expect(validate('AllResponse', all)).not.toEqual([]);
    const other = structuredClone(buildTlds(data)) as unknown as { license: { spdx: string } };
    other.license.spdx = 'CC0-1.0';
    expect(validate('TldsResponse', other)).not.toEqual([]);
  });

  it('rejects documents that drift from the description', () => {
    const all = structuredClone(buildAll(data)) as unknown as Record<string, unknown>;
    all.extra = 1;
    expect(validate('AllResponse', all)).not.toEqual([]);
    const tld = structuredClone(buildTld(data, 'de'));
    const key = Object.keys(tld.derived.tco)[0] ?? '';
    (tld.derived.tco[key]?.gross as unknown as Record<string, unknown>).sum_3y = 1.5;
    expect(validate('TldResponse', tld)).not.toEqual([]);
  });

  it('rejects an invalid OpenAPI document', () => {
    const broken = structuredClone(openapi) as unknown as { info: Record<string, unknown> };
    delete broken.info.version;
    expect(validateOpenApi(broken)).not.toEqual([]);
  });

  // pins the $dynamicRef rewrite in api-validator.mjs: Schema Objects are checked as JSON Schema
  // 2020-12, in the components and in a Parameter's `schema` (not as a Parameter). Without the
  // rewrite the errors name the Schema Object itself, never its `type`.
  it('rejects a broken Schema Object in a component and in a parameter', () => {
    type Doc = {
      components: { schemas: Record<string, Record<string, unknown>> };
      paths: Record<string, { get: { parameters: { schema: Record<string, unknown> }[] } }>;
    };
    const component = structuredClone(openapi) as unknown as Doc;
    const name = Object.keys(component.components.schemas)[0] ?? '';
    component.components.schemas[name]!.type = 5;
    expect(validateOpenApi(component).join('\n')).toContain(`/components/schemas/${name}/type `);

    const parameter = structuredClone(openapi) as unknown as Doc;
    const path = Object.keys(parameter.paths).find((k) => parameter.paths[k]?.get.parameters);
    expect(path).toBeDefined();
    parameter.paths[path!]!.get.parameters[0]!.schema.type = 5;
    expect(validateOpenApi(parameter).join('\n')).toContain('/parameters/0/schema/type ');
  });
});

describe('payloadForTld', () => {
  it('keeps only the rows and providers of one TLD, and every footnote text', () => {
    for (const tld of payload.tlds) {
      const p = payloadForTld(payload, tld);
      expect(p.tlds).toEqual([tld]);
      expect(p.rows).toEqual(payload.rows.filter((r) => r.tld === tld));
      expect(Object.keys(p.providers).sort()).toEqual(
        [...new Set(p.rows.map((r) => r.providerId))].sort(),
      );
      expect(p.notes).toEqual(payload.notes);
    }
  });

  it('passes fields it does not know through unchanged', () => {
    const extended = { ...payload, details: { x: 1 } };
    expect((payloadForTld(extended, 'de') as typeof extended).details).toEqual({ x: 1 });
  });
});

describe('sitemap', () => {
  it('lists HTML pages only, without 404 and API files, sorted and absolute', () => {
    const urls = sitemapUrls(
      ['', 'tld/de/', 'api/', '404', '404/', 'api/v1/all.json', 'robots.txt', 'tld/de/'],
      'https://tldcost.io',
    );
    expect(urls).toEqual([
      'https://tldcost.io/',
      'https://tldcost.io/api/',
      'https://tldcost.io/tld/de/',
    ]);
    expect(sitemapXml(urls)).toContain('<loc>https://tldcost.io/tld/de/</loc>');
  });
});
