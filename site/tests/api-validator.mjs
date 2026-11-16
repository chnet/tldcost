// Validation of the /api/v1 documents, shared by the unit tests (in-memory documents)
// and tests/check-build.mjs (files in dist/).
//   validateOpenApi(doc): the document against the official OpenAPI 3.1 schema (vendored, see
//     tests/vendor/README.md) and every component schema compiles as JSON Schema 2020-12.
//   responseValidator(openapi, schemas): validate(component, body) -> list of error strings.
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const OAS_FILE = new URL('./vendor/oas-3.1-schema-2022-10-07.json', import.meta.url);
const DYNAMIC_REF = '{"$dynamicRef":"#meta"}';

/**
 * The OAS schema with its Schema Object hook made static. The vendored file points every Schema
 * Object at `$defs/schema` through `$dynamicRef: "#meta"` (an extension point for dialects), which
 * ajv resolves to the wrong place: a Parameter's `schema` was validated as a Parameter. Without an
 * extending dialect the dynamic ref is the same as a static `$ref` to `$defs/schema`. That target
 * becomes the JSON Schema 2020-12 meta-schema (OpenAPI 3.1's default dialect), so Schema Objects are
 * checked as real JSON Schema, as the official `schema-base` variant does.
 */
function oasSchema() {
  const text = JSON.stringify(JSON.parse(readFileSync(OAS_FILE, 'utf8')));
  const count = text.split(DYNAMIC_REF).length - 1;
  if (count !== 4) throw new Error(`OAS schema: expected 4 ${DYNAMIC_REF}, found ${count}`);
  const schema = JSON.parse(text.replaceAll(DYNAMIC_REF, '{"$ref":"#/$defs/schema"}'));
  schema.$defs.schema = { $ref: 'https://json-schema.org/draft/2020-12/schema' };
  return schema;
}

function ajv(strict) {
  const a = new Ajv2020({ allErrors: true, strict });
  addFormats(a);
  // used by the OpenAPI schema for media types; not checked further
  a.addFormat('media-range', true);
  return a;
}

const fmt = (errors) => (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`);

/** Errors of an OpenAPI document; empty when valid. */
export function validateOpenApi(doc) {
  const a = ajv(false);
  const validate = a.compile(oasSchema());
  if (!validate(doc)) return fmt(validate.errors);
  return [];
}

/**
 * Validator for the response bodies described by `openapi`. `schemas` are the served schema files
 * (their `$id` is the URL the OpenAPI refers to).
 */
export function responseValidator(openapi, schemas) {
  const a = ajv(true);
  for (const s of schemas) a.addSchema(s);
  // the component schemas as one schema resource; local refs are rewritten to point into it
  const defs = JSON.parse(
    JSON.stringify(openapi.components.schemas).replaceAll(
      '"#/components/schemas/',
      '"urn:tldcost:openapi#/$defs/',
    ),
  );
  a.addSchema({ $id: 'urn:tldcost:openapi', $defs: defs });
  const cache = new Map();
  return (component, body) => {
    if (!(component in openapi.components.schemas)) return [`unknown component ${component}`];
    let validate = cache.get(component);
    if (!validate) {
      validate = a.compile({ $ref: `urn:tldcost:openapi#/$defs/${component}` });
      cache.set(component, validate);
    }
    return validate(body) ? [] : fmt(validate.errors);
  };
}
