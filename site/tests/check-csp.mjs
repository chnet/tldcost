// The site's CSP (infra/lib/content-security-policy.json) allows scripts and styles from 'self'
// only: no 'unsafe-inline', no hashes. Lists what a built page contains that this CSP would block.
const RUN_TYPES = new Set(['', 'text/javascript', 'application/javascript', 'module']);

/** Findings for one HTML page; empty when the page needs no inline script or style. */
export function cspFindings(html) {
  const out = [];
  for (const m of html.matchAll(/<script(\s[^>]*)?>/gi)) {
    const attrs = m[1] ?? '';
    const type = (/\stype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '').toLowerCase();
    if (!/\ssrc\s*=/i.test(attrs) && RUN_TYPES.has(type)) out.push('inline <script>');
  }
  if (/<style[\s>]/i.test(html)) out.push('inline <style>');
  if (/<[a-z][^>]*\sstyle\s*=/i.test(html)) out.push('style="" attribute');
  if (/<[a-z][^>]*\son[a-z]+\s*=/i.test(html)) out.push('inline event handler (on...="")');
  if (/\s(?:href|src|action)\s*=\s*["']?\s*javascript:/i.test(html)) out.push('javascript: URL');
  return [...new Set(out)];
}
