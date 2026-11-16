// Theme switch (design system ThemeSwitch). Loaded as a blocking external script in <head>, so the
// page is painted in the right theme without an inline script (CSP default-src 'self').
//
// - The choice lives only in the URL: ?theme=light or ?theme=dark; without it the page follows the
//   system (prefers-color-scheme). No cookie, no storage.
// - Internal page links carry ?theme= along; links to files (with a dot in the last path segment,
//   e.g. /api/v1/all.json) and same-page anchors stay unchanged.
// - The switch links (a[data-theme-choice]) get the current URL with only `theme` changed, so other
//   parameters (tld, sort, ...) are kept, also after the table has rewritten the URL.
// - The language links (nav[data-lang-switch] a, Archiv-Issue 33) keep their page and get the current query,
//   so the view (tld, vat, cols, f, theme, ...) survives the switch. Without JavaScript they are
//   plain links to the same page in the other language.
(function () {
  'use strict';
  var THEMES = ['light', 'dark'];
  var root = document.documentElement;

  function currentTheme() {
    var t = new URLSearchParams(window.location.search).get('theme');
    return THEMES.indexOf(t) === -1 ? null : t;
  }

  var theme = currentTheme();
  if (theme) root.setAttribute('data-theme', theme);
  else root.removeAttribute('data-theme');
  // the switch needs this script; without JavaScript it stays hidden (foundation.css)
  root.classList.add('tc-js');

  function isPageLink(a) {
    var raw = a.getAttribute('href');
    if (!raw || raw.charAt(0) === '#' || a.hasAttribute('download')) return false;
    var url = new URL(a.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    var last = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    return last.indexOf('.') === -1;
  }

  function choiceHref(choice) {
    var url = new URL(window.location.href);
    url.hash = '';
    if (choice === 'system') url.searchParams.delete('theme');
    else url.searchParams.set('theme', choice);
    return url.pathname + url.search;
  }

  function linkHref(a) {
    var url = new URL(a.href, window.location.href);
    if (theme) url.searchParams.set('theme', theme);
    else url.searchParams.delete('theme');
    return url.pathname + url.search + url.hash;
  }

  function isLangLink(a) {
    var nav = a.parentNode;
    return !!(nav && nav.hasAttribute && nav.hasAttribute('data-lang-switch'));
  }

  function update(a) {
    if (isLangLink(a)) {
      a.setAttribute(
        'href',
        new URL(a.href, window.location.href).pathname + window.location.search,
      );
      return;
    }
    var choice = a.getAttribute('data-theme-choice');
    if (choice) {
      a.setAttribute('href', choiceHref(choice));
      if (choice === (theme || 'system')) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    } else if (theme && isPageLink(a)) {
      a.setAttribute('href', linkHref(a));
    }
  }

  function updateAll() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) update(links[i]);
  }

  // links rendered later (the table island) or URLs rewritten since load: fix the link when used
  function onUse(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (a) update(a);
  }

  document.addEventListener('DOMContentLoaded', updateAll);
  document.addEventListener('click', onUse, true);
  document.addEventListener('auxclick', onUse, true);
  document.addEventListener('focusin', onUse, true);
  document.addEventListener('contextmenu', onUse, true);
})();
