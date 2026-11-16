// CSP without 'unsafe-inline': the build moves inline scripts and styles into files
// (integrations/externalize-inline.mjs), and check-build.mjs fails on anything left (check-csp.mjs).
import { describe, expect, it } from 'vitest';
import { externalizeInline } from '../../integrations/externalize-inline.mjs';
import { cspFindings } from '../check-csp.mjs';

const emitter = () => {
  const files: Array<[string, string]> = [];
  const emit = (content: string, ext: string) => {
    files.push([ext, content]);
    return `/_astro/f${files.length}.${ext}`;
  };
  return { files, emit };
};

describe('externalizeInline', () => {
  it('moves classic and module scripts into files, keeping attributes and order', () => {
    const { files, emit } = emitter();
    const html =
      '<p>a</p><script>one()</script><script type="module" data-x>two()</script><p>b</p>';
    expect(externalizeInline(html, emit)).toBe(
      '<p>a</p><script src="/_astro/f1.js"></script>' +
        '<script type="module" data-x src="/_astro/f2.js"></script><p>b</p>',
    );
    expect(files).toEqual([
      ['js', 'one()'],
      ['js', 'two()'],
    ]);
  });

  it('leaves external scripts and data blocks alone', () => {
    const { files, emit } = emitter();
    const html =
      '<script src="/theme-init.js"></script><script src="/x.js" defer></script>' +
      '<script type="application/ld+json">{"a":1}</script>';
    expect(externalizeInline(html, emit)).toBe(html);
    expect(files).toEqual([]);
  });

  it('turns <style> into a stylesheet link and keeps media', () => {
    const { files, emit } = emitter();
    expect(
      externalizeInline('<style>a{b:c}</style><style media="print">d{e:f}</style>', emit),
    ).toBe(
      '<link rel="stylesheet" href="/_astro/f1.css">' +
        '<link rel="stylesheet" href="/_astro/f2.css" media="print">',
    );
    expect(files).toEqual([
      ['css', 'a{b:c}'],
      ['css', 'd{e:f}'],
    ]);
  });

  it('refuses a <style> with attributes it cannot carry over', () => {
    expect(() => externalizeInline('<style nonce="x">a{}</style>', emitter().emit)).toThrow(
      /unsupported <style/,
    );
  });

  it('leaves a page without inline code unchanged and clean for the CSP check', () => {
    const { emit } = emitter();
    const html = '<script>x()</script><style>a{}</style><p class="y">z</p>';
    const out = externalizeInline(html, emit);
    expect(cspFindings(html)).toEqual(['inline <script>', 'inline <style>']);
    expect(cspFindings(out)).toEqual([]);
    expect(externalizeInline(out, emit)).toBe(out);
  });
});

describe('cspFindings', () => {
  it('finds style attributes, inline handlers and javascript: URLs', () => {
    expect(cspFindings('<pre style="color:red">x</pre>')).toEqual(['style="" attribute']);
    expect(cspFindings('<button onclick="go()">x</button>')).toEqual([
      'inline event handler (on...="")',
    ]);
    expect(cspFindings('<a href="javascript:go()">x</a>')).toEqual(['javascript: URL']);
  });

  it('ignores escaped markup in text and data blocks', () => {
    expect(
      cspFindings(
        '<p>&lt;script&gt;x()&lt;/script&gt; style="a" onclick="b"</p>' +
          '<script type="application/json">{"style":"x"}</script>',
      ),
    ).toEqual([]);
  });
});
