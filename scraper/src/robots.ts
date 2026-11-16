// Minimal robots.txt (RFC 9309) evaluation for one product token: groups, allow/disallow with the
// `*` and `$` wildcards, longest match wins, allow wins a tie. Crawl-delay (not in RFC 9309, but
// set e.g. by the ECB) is honoured as the minimum gap between two requests to the host.

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  /** Whether `pathAndQuery` (e.g. "/api/v1/x?y=1") may be fetched. */
  isAllowed(pathAndQuery: string): boolean;
  /** Crawl-delay in seconds for our group, 0 if none. */
  crawlDelay: number;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelay: number;
}

export const ALLOW_ALL: Robots = { isAllowed: () => true, crawlDelay: 0 };
export const DISALLOW_ALL: Robots = { isAllowed: () => false, crawlDelay: 0 };

function parseGroups(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelay: 0 };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue; // rules before any user-agent line belong to no group
    if (key === 'allow' || key === 'disallow') {
      if (value) current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const delay = Number(value);
      if (Number.isFinite(delay) && delay > 0) current.crawlDelay = delay;
    }
  }
  return groups;
}

function toRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** Parses robots.txt for `productToken` (e.g. "tldcost-bot"); falls back to the `*` groups. */
export function parseRobots(text: string, productToken: string): Robots {
  const token = productToken.toLowerCase();
  const groups = parseGroups(text);
  let selected = groups.filter((g) => g.agents.includes(token));
  if (selected.length === 0) selected = groups.filter((g) => g.agents.includes('*'));
  const rules = selected.flatMap((g) => g.rules).map((r) => ({ ...r, re: toRegExp(r.pattern) }));
  const crawlDelay = Math.max(0, ...selected.map((g) => g.crawlDelay));
  return {
    crawlDelay,
    isAllowed(pathAndQuery) {
      let best: { allow: boolean; length: number } | undefined;
      for (const r of rules) {
        if (!r.re.test(pathAndQuery)) continue;
        const length = r.pattern.length;
        if (!best || length > best.length || (length === best.length && r.allow)) {
          best = { allow: r.allow, length };
        }
      }
      return best?.allow ?? true;
    },
  };
}
