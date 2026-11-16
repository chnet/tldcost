import type { APIRoute } from 'astro';
import { buildTlds, jsonResponse } from '../../../lib/api';
import { siteData } from '../../../lib/site-data';

export const GET: APIRoute = () => jsonResponse(buildTlds(siteData()));
