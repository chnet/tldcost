import type { APIRoute, GetStaticPaths } from 'astro';
import { apiTlds, buildTld, jsonResponse } from '../../../../lib/api';
import { siteData } from '../../../../lib/site-data';

export const getStaticPaths = (() =>
  apiTlds(siteData()).map((tld) => ({ params: { tld } }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ params }) => jsonResponse(buildTld(siteData(), String(params.tld)));
