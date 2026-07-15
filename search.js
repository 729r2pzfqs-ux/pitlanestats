/*
 * PitlaneStats global search.
 *
 * Loads /search-index.json (built by tools/generate-search-index.js) and
 * provides an instant, client-side fuzzy search overlay. Self-contained: it
 * injects its own styles and modal markup, so the only per-page requirement is
 * a button that calls PLS_openSearch() and a <script src="/search.js" defer>.
 *
 * Open with: the nav search button, the "/" key, or Cmd/Ctrl+K.
 */
(function () {
  'use strict';
  if (window.__plsSearchInit) return;
  window.__plsSearchInit = true;

  var INDEX_URL = '/search-index.json';
  var MAX_RESULTS = 40;

  var index = null;       // array of [title, url, section, kw]
  var loading = false;
  var loadError = false;
  var els = {};           // cached DOM nodes
  var results = [];       // current result objects
  var active = 0;         // highlighted result index
  var debounceTimer = null;

  // Coarse per-section tie-break boost (people/teams/circuits feel most useful).
  var SECTION_BOOST = {
    'Driver': 8, 'Team': 7, 'Circuit': 6, 'Season': 5, 'Race': 4,
    'Head-to-Head': 4, 'Circuit Records': 3, 'Records': 3, 'Battle': 3,
    'Decade': 2, 'On This Day': 1
  };

  // Quick links shown when the box is empty.
  var QUICK = [
    ['Drivers', '/drivers/'], ['Teams', '/constructors/'], ['Circuits', '/circuits/'],
    ['Seasons', '/seasons/'], ['Records', '/records/'], ['Head-to-Head', '/head-to-head/'],
    ['On This Day', '/on-this-day/'], ['Battles', '/battles/']
  ];

  // ---- styles -------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById('pls-search-style')) return;
    var css = [
      '#pls-search-overlay{position:fixed;inset:0;z-index:1000;display:none;',
      'background:rgba(8,8,12,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);}',
      '#pls-search-overlay.pls-open{display:block;}',
      '.pls-panel{width:100%;max-width:42rem;margin:10vh auto 0;background:#1A1A26;border:1px solid #252535;',
      'border-radius:14px;box-shadow:0 24px 60px -12px rgba(0,0,0,.7);overflow:hidden;',
      'font-family:"Inter",sans-serif;animation:pls-pop .14s ease-out;}',
      '@keyframes pls-pop{from{opacity:0;transform:translateY(-8px) scale(.99);}to{opacity:1;transform:none;}}',
      '@media (max-width:640px){.pls-panel{margin:0;max-width:none;height:100%;border-radius:0;border:0;}}',
      '.pls-inputrow{display:flex;align-items:center;gap:.7rem;padding:.95rem 1.1rem;border-bottom:1px solid #252535;}',
      '.pls-inputrow svg{width:20px;height:20px;color:#E10600;flex:none;}',
      '#pls-search-input{flex:1;background:transparent;border:0;outline:0;color:#EEEEF0;font-size:1.05rem;',
      'font-family:"Inter",sans-serif;}',
      '#pls-search-input::placeholder{color:#8E8EA0;}',
      '.pls-esc{font-size:.65rem;color:#8E8EA0;border:1px solid #252535;border-radius:6px;padding:.15rem .4rem;',
      'flex:none;letter-spacing:.04em;}',
      '.pls-results{max-height:60vh;overflow-y:auto;padding:.4rem;overscroll-behavior:contain;}',
      '@media (max-width:640px){.pls-results{max-height:calc(100% - 60px);}}',
      '.pls-item{display:flex;align-items:center;justify-content:space-between;gap:.75rem;',
      'padding:.6rem .75rem;border-radius:9px;cursor:pointer;text-decoration:none;color:inherit;}',
      '.pls-item:hover{background:rgba(225,6,0,.08);}',
      '.pls-item.pls-active{background:rgba(225,6,0,.14);box-shadow:inset 2px 0 0 #E10600;}',
      '.pls-it-main{min-width:0;}',
      '.pls-it-title{color:#EEEEF0;font-size:.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.pls-it-title mark{background:transparent;color:#E10600;font-weight:600;}',
      '.pls-it-sub{color:#8E8EA0;font-size:.72rem;margin-top:.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.pls-badge{flex:none;font-size:.62rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;',
      'color:#8E8EA0;background:#111118;border:1px solid #252535;border-radius:999px;padding:.2rem .55rem;}',
      '.pls-empty{padding:1.4rem 1.2rem;color:#8E8EA0;font-size:.9rem;}',
      '.pls-quick-h{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:#8E8EA0;',
      'padding:.7rem .85rem .3rem;}',
      '.pls-foot{display:flex;gap:1rem;flex-wrap:wrap;padding:.55rem 1.1rem;border-top:1px solid #252535;',
      'color:#8E8EA0;font-size:.7rem;}',
      '.pls-foot kbd{font-family:inherit;background:#111118;border:1px solid #252535;border-radius:5px;',
      'padding:.05rem .35rem;color:#8E8EA0;}',
      '.pls-foot .pls-cnt{margin-left:auto;}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'pls-search-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---- modal --------------------------------------------------------------
  function buildModal() {
    if (els.overlay) return;
    injectStyles();
    var overlay = document.createElement('div');
    overlay.id = 'pls-search-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Site search');
    overlay.innerHTML =
      '<div class="pls-panel" role="document">' +
        '<div class="pls-inputrow">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
          '<input id="pls-search-input" type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="Search drivers, teams, circuits, races…" aria-label="Search PitlaneStats">' +
          '<span class="pls-esc">ESC</span>' +
        '</div>' +
        '<div class="pls-results" id="pls-results"></div>' +
        '<div class="pls-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span class="pls-cnt" id="pls-count"></span></div>' +
      '</div>';
    document.body.appendChild(overlay);

    els.overlay = overlay;
    els.input = overlay.querySelector('#pls-search-input');
    els.results = overlay.querySelector('#pls-results');
    els.count = overlay.querySelector('#pls-count');

    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) closeSearch();
    });
    overlay.querySelector('.pls-esc').addEventListener('click', closeSearch);
    els.input.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(render, 60);
    });
    els.input.addEventListener('keydown', onInputKey);
  }

  // ---- data ---------------------------------------------------------------
  // Fold diacritics so "raikkonen" matches "Räikkönen".
  function fold(s) {
    return s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s;
  }

  function loadIndex() {
    if (index || loading) return;
    loading = true;
    fetch(INDEX_URL)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        index = data;
        // Precompute lowercase title + haystack for fast scoring.
        for (var i = 0; i < index.length; i++) {
          var e = index[i];
          e[4] = fold(e[0].toLowerCase());
          e[5] = fold((e[0] + ' ' + e[2] + ' ' + (e[3] || '')).toLowerCase());
        }
        loading = false;
        if (els.overlay && els.overlay.classList.contains('pls-open')) render();
      })
      .catch(function () { loading = false; loadError = true; if (els.overlay) render(); });
  }

  // ---- scoring ------------------------------------------------------------
  function isBoundary(s, i) {
    if (i === 0) return true;
    return /[\s\-_/(]/.test(s.charAt(i - 1));
  }

  // Subsequence fuzzy: returns 0..30 (compact matches score higher) or -1.
  function fuzzy(q, t) {
    var qi = 0, ti = 0, first = -1, last = -1;
    while (qi < q.length && ti < t.length) {
      if (q.charAt(qi) === t.charAt(ti)) {
        if (first < 0) first = ti;
        last = ti;
        qi++;
      }
      ti++;
    }
    if (qi < q.length) return -1;
    var span = last - first + 1;
    var density = q.length / span;        // 1 = contiguous
    return 6 + Math.round(density * 24);
  }

  function score(item, q, tokens) {
    var title = item[4], hay = item[5];
    var s = 0;
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var ti = title.indexOf(tok);
      if (ti === 0) {
        s += 110;
      } else if (ti > 0) {
        s += isBoundary(title, ti) ? 80 : 55;
      } else {
        var hi = hay.indexOf(tok);
        if (hi >= 0) {
          s += 28;
        } else if (tokens.length === 1) {
          var f = fuzzy(tok, title);
          if (f < 0) {
            f = fuzzy(tok, hay);
            if (f < 0) return -1;
            f = Math.max(2, f - 8);
          }
          s += f;
        } else {
          return -1;
        }
      }
    }
    if (tokens.length > 1 && title.indexOf(q) >= 0) s += 90;
    if (title === q) s += 300;
    else if (title.indexOf(q) === 0) s += 60;
    s += SECTION_BOOST[item[2]] || 0;
    s -= item[0].length * 0.08;          // prefer shorter / more specific titles
    return s;
  }

  function search(q) {
    q = fold(q.toLowerCase().trim());
    if (!q || !index) return [];
    var tokens = q.split(/\s+/);
    var scored = [];
    for (var i = 0; i < index.length; i++) {
      var sc = score(index[i], q, tokens);
      if (sc > -1) scored.push([sc, index[i]]);
    }
    scored.sort(function (a, b) { return b[0] - a[0]; });
    var out = [];
    for (var j = 0; j < Math.min(scored.length, MAX_RESULTS); j++) out.push(scored[j][1]);
    out._total = scored.length;
    return out;
  }

  // ---- render -------------------------------------------------------------
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function highlight(title, tokens) {
    var safe = escapeHtml(title);
    if (!tokens.length) return safe;
    // Build a regex of tokens, longest first, to mark matches in the title.
    var parts = tokens.slice().filter(Boolean)
      .sort(function (a, b) { return b.length - a.length; })
      .map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
    if (!parts.length) return safe;
    try {
      return safe.replace(new RegExp('(' + parts.join('|') + ')', 'ig'), '<mark>$1</mark>');
    } catch (e) {
      return safe;
    }
  }

  function render() {
    if (!els.results) return;
    var q = els.input.value;
    var box = els.results;

    if (!q.trim()) {
      results = [];
      active = 0;
      els.count.textContent = '';
      var html = '<div class="pls-quick-h">Jump to</div>';
      for (var k = 0; k < QUICK.length; k++) {
        html += '<a class="pls-item" href="' + QUICK[k][1] + '">' +
          '<span class="pls-it-main"><div class="pls-it-title">' + QUICK[k][0] + '</div></span>' +
          '<span class="pls-badge">Section</span></a>';
      }
      box.innerHTML = html;
      return;
    }

    if (loading || !index) {
      box.innerHTML = '<div class="pls-empty">Loading search…</div>';
      return;
    }
    if (loadError) {
      box.innerHTML = '<div class="pls-empty">Search is unavailable right now.</div>';
      return;
    }

    results = search(q);
    active = 0;
    var tokens = q.toLowerCase().trim().split(/\s+/);

    if (!results.length) {
      box.innerHTML = '<div class="pls-empty">No results for “' + escapeHtml(q) + '”.</div>';
      els.count.textContent = '0 results';
      return;
    }

    var out = '';
    for (var i = 0; i < results.length; i++) {
      var e = results[i];
      out += '<a class="pls-item' + (i === 0 ? ' pls-active' : '') + '" href="' + e[1] +
        '" data-i="' + i + '">' +
        '<span class="pls-it-main">' +
          '<div class="pls-it-title">' + highlight(e[0], tokens) + '</div>' +
          '<div class="pls-it-sub">' + escapeHtml(prettyUrl(e[1])) + '</div>' +
        '</span>' +
        '<span class="pls-badge">' + escapeHtml(e[2]) + '</span>' +
      '</a>';
    }
    box.innerHTML = out;
    els.count.textContent = (results._total > results.length ?
      results.length + ' of ' + results._total : results.length) + ' results';

    Array.prototype.forEach.call(box.querySelectorAll('.pls-item'), function (node) {
      node.addEventListener('mousemove', function () {
        setActive(parseInt(node.getAttribute('data-i'), 10));
      });
    });
  }

  function prettyUrl(u) {
    return u.replace(/\/$/, '') || '/';
  }

  function setActive(i) {
    var nodes = els.results.querySelectorAll('.pls-item');
    if (!nodes.length) return;
    if (i < 0) i = 0;
    if (i > nodes.length - 1) i = nodes.length - 1;
    if (nodes[active]) nodes[active].classList.remove('pls-active');
    active = i;
    nodes[active].classList.add('pls-active');
    nodes[active].scrollIntoView({ block: 'nearest' });
  }

  function onInputKey(e) {
    var nodes = els.results.querySelectorAll('.pls-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (nodes[active]) window.location.href = nodes[active].getAttribute('href');
    } else if (e.key === 'Escape') {
      e.preventDefault(); closeSearch();
    }
  }

  // ---- open / close -------------------------------------------------------
  function openSearch() {
    buildModal();
    loadIndex();
    els.overlay.classList.add('pls-open');
    document.documentElement.style.overflow = 'hidden';
    render();
    els.input.value = els.input.value; // keep prior query if any
    els.input.focus();
    els.input.select();
  }

  function closeSearch() {
    if (!els.overlay) return;
    els.overlay.classList.remove('pls-open');
    document.documentElement.style.overflow = '';
  }

  // ---- global hooks -------------------------------------------------------
  window.PLS_openSearch = openSearch;

  document.addEventListener('keydown', function (e) {
    var open = els.overlay && els.overlay.classList.contains('pls-open');
    // Cmd/Ctrl + K toggles from anywhere.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      open ? closeSearch() : openSearch();
      return;
    }
    if (open) return;
    // "/" opens, unless typing in a field.
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) && !e.target.isContentEditable) {
      e.preventDefault();
      openSearch();
    }
  });

  // Warm the index on idle so the first search is instant.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(loadIndex, { timeout: 3000 });
  } else {
    setTimeout(loadIndex, 1500);
  }
})();
