import type { APIRoute } from 'astro';
import { apiTlds, jsonResponse } from '../../../lib/api';
import { buildOpenApi } from '../../../lib/openapi';
import { siteData } from '../../../lib/site-data';

export const GET: APIRoute = () => jsonResponse(buildOpenApi(apiTlds(siteData())));
