import type { APIRoute, GetStaticPaths } from 'astro';
import { jsonResponse, SCHEMA_NAMES, servedSchema, type SchemaName } from '../../../../lib/api';
import { recordSchema } from '../../../../lib/site-data';

export const getStaticPaths = (() =>
  SCHEMA_NAMES.map((name) => ({ params: { name } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => {
  const name = params.name as SchemaName;
  return jsonResponse(servedSchema(recordSchema(name), name));
};
