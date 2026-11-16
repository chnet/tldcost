// Footnote tooltips (design system Footnotes). External, deferred script: the numbered list under
// the table stays the source of every note; this only shows the same text in a tooltip on hover or
// keyboard focus of a marker (a.tc-fn, href="#<note id>"). Popover API (top layer), so the
// sideways-scrolling table frame never clips it. Listeners are delegated on document, because the
// table island renders markers after hydration and on every view change. Without the Popover API
// or without JavaScript the markers still link to the list. No tooltip on touch: a tap follows
// the link.
(function () {
  'use strict';
  var tip = document.getElementById('tc-tip');
  if (!tip || !tip.showPopover) return;
  var current = null;
  var hideTimer = null;

  function noteFor(a) {
    var h = a.getAttribute('href') || '';
    return h.charAt(0) === '#' ? document.getElementById(decodeURIComponent(h.slice(1))) : null;
  }
  function place(a) {
    var r = a.getBoundingClientRect();
    var t = tip.getBoundingClientRect();
    var gap = 6;
    var m = 8;
    var top = r.top - t.height - gap;
    if (top < m) top = r.bottom + gap;
    var left = Math.max(
      m,
      Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - m),
    );
    tip.style.top = top + 'px';
    tip.style.left = left + 'px';
  }
  function close() {
    clearTimeout(hideTimer);
    if (tip.matches(':popover-open')) tip.hidePopover();
    if (current) current.removeAttribute('data-open');
    current = null;
  }
  function show(a) {
    clearTimeout(hideTimer);
    var note = noteFor(a);
    if (!note) return;
    if (current && current !== a) current.removeAttribute('data-open');
    var num = document.createElement('b');
    num.textContent = a.textContent.trim();
    tip.replaceChildren(num, document.createTextNode(note.textContent.trim()));
    if (!tip.matches(':popover-open')) tip.showPopover();
    place(a);
    current = a;
    a.setAttribute('data-open', '');
  }
  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(close, 150);
  }
  function marker(el) {
    return el && el.closest ? el.closest('a.tc-fn') : null;
  }

  document.addEventListener('pointerover', function (e) {
    var a = marker(e.target);
    if (a && e.pointerType !== 'touch') show(a);
  });
  document.addEventListener('pointerout', function (e) {
    var a = marker(e.target);
    if (a && !a.contains(e.relatedTarget)) hideSoon();
  });
  document.addEventListener('focusin', function (e) {
    var a = marker(e.target);
    if (a) show(a);
  });
  document.addEventListener('focusout', function (e) {
    if (marker(e.target)) hideSoon();
  });
  tip.addEventListener('pointerenter', function () {
    clearTimeout(hideTimer);
  });
  tip.addEventListener('pointerleave', hideSoon);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && current) close();
  });
  window.addEventListener(
    'scroll',
    function () {
      if (current) place(current);
    },
    true,
  );
  window.addEventListener('resize', function () {
    if (current) place(current);
  });
})();
