# Vendored files

- `oas-3.1-schema-2022-10-07.json`: the official JSON Schema for OpenAPI 3.1 documents, unchanged,
  from <https://spec.openapis.org/oas/3.1/schema/2022-10-07> (OpenAPI Initiative, Apache License 2.0).
  Used by `tests/api-validator.mjs` to check `/api/v1/openapi.json`, so no OpenAPI linter dependency is
  needed. Replace the file as a whole when the OpenAPI Initiative publishes a new version.
