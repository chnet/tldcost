import { describe, expect, it } from 'vitest';
import { ALLOW_ALL, DISALLOW_ALL, parseRobots } from '../src/robots.js';

describe('parseRobots', () => {
  it('applies the * group: netcup-style disallows', () => {
    const r = parseRobots(
      'User-agent: *\nDisallow: /api/*\nDisallow: /de/product/*\n\nSitemap: https://x/s.xml',
      'tldcost-bot',
    );
    expect(r.isAllowed('/de/domain/zusaetzliche-domain-de')).toBe(true);
    expect(r.isAllowed('/__sitemap__/products-de-DE.xml')).toBe(true);
    expect(r.isAllowed('/api/v1/x')).toBe(false);
    expect(r.isAllowed('/de/product/1')).toBe(false);
    expect(r.crawlDelay).toBe(0);
  });
  it('treats an empty Disallow as allow-all (INWX)', () => {
    expect(
      parseRobots('User-Agent: *\nDisallow:  \n', 'tldcost-bot').isAllowed(
        '/api/v1/domain/all-prices',
      ),
    ).toBe(true);
  });
  it('prefers the group naming our token, case-insensitively, and merges its groups', () => {
    const text = [
      'User-agent: *',
      'Disallow: /',
      '',
      'User-agent: TLDCost-Bot',
      'User-agent: other',
      'Disallow: /private',
      'Crawl-delay: 2',
      '',
      'User-agent: tldcost-bot',
      'Disallow: /also',
    ].join('\r\n');
    const r = parseRobots(text, 'tldcost-bot');
    expect(r.isAllowed('/public')).toBe(true);
    expect(r.isAllowed('/private/x')).toBe(false);
    expect(r.isAllowed('/also')).toBe(false);
    expect(r.crawlDelay).toBe(2);
  });
  it('longest match wins, allow wins a tie, $ anchors the end', () => {
    const r = parseRobots(
      'user-agent: *\ndisallow: /a\nallow: /a/b\ndisallow: /x\nallow: /x\ndisallow: /*.pdf$ # comment\n',
      'bot',
    );
    expect(r.isAllowed('/a/c')).toBe(false);
    expect(r.isAllowed('/a/b/c')).toBe(true);
    expect(r.isAllowed('/x')).toBe(true);
    expect(r.isAllowed('/doc.pdf')).toBe(false);
    expect(r.isAllowed('/doc.pdf?x=1')).toBe(true);
    const reversed = parseRobots(
      'user-agent: *\nallow: /a/b\ndisallow: /a\nallow: /y\ndisallow: /y\n',
      'bot',
    );
    expect(reversed.isAllowed('/a/b/c')).toBe(true);
    expect(reversed.isAllowed('/y')).toBe(true);
  });
  it('reads Crawl-delay (ECB sets 5) and ignores junk', () => {
    const r = parseRobots(
      'Disallow: /orphan\nnonsense\nUser-agent: *\nCrawl-delay: abc\nCrawl-delay: 5\nDisallow: /a$b\n',
      'bot',
    );
    expect(r.crawlDelay).toBe(5);
    expect(r.isAllowed('/orphan')).toBe(true);
    expect(r.isAllowed('/a$b')).toBe(false);
  });
  it('without any matching group everything is allowed', () => {
    expect(parseRobots('User-agent: googlebot\nDisallow: /\n', 'tldcost-bot').isAllowed('/')).toBe(
      true,
    );
    expect(ALLOW_ALL.isAllowed('/')).toBe(true);
    expect(DISALLOW_ALL.isAllowed('/')).toBe(false);
  });
});
