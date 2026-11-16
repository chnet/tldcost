import type { Adapter } from '../types.js';
import { allinkl } from './all-inkl.js';
import { checkdomain } from './checkdomain.js';
import { domainfactory } from './domainfactory.js';
import { hetzner } from './hetzner.js';
import { inwx } from './inwx.js';
import { netcup } from './netcup.js';
import { oneCom } from './one-com.js';
import { porkbun } from './porkbun.js';
import { strato } from './strato.js';
import { unitedDomains } from './united-domains.js';

/** All adapters, by provider id. An adapter only runs when data/providers/<id>.json exists. */
export const ADAPTERS: readonly Adapter[] = [
  allinkl,
  checkdomain,
  domainfactory,
  hetzner,
  inwx,
  netcup,
  oneCom,
  porkbun,
  strato,
  unitedDomains,
];
