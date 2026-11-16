import type { APIRoute } from 'astro';
import { buildAll, jsonResponse } from '../../../lib/api';
import { siteData } from '../../../lib/site-data';

export const GET: APIRoute = () => jsonResponse(buildAll(siteData()));
