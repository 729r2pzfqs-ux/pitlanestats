#!/usr/bin/env node
/*
 * inject-search.js
 *
 * Injects the global search UI into every HTML page:
 *   1. A desktop search button as the last item in the main nav.
 *   2. A mobile search button grouped with the hamburger menu button.
 *   3. <script src="/search.js" defer> before </body>.
 *
 * Idempotent: pages already containing the search button are skipped. Run from
 * the repo root after editing the markup:
 *
 *     node tools/inject-search.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SENTINEL = 'id="pls-search-btn"';

const MAGNIFIER =
  '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';
const MAGNIFIER_LG =
  '<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>';

// Desktop button — inserted before the first </nav> (the main nav).
const DESKTOP_BTN =
  '<button id="pls-search-btn" type="button" onclick="PLS_openSearch()" aria-label="Search (press /)" title="Search (/)" class="text-f1-text hover:text-f1-red transition-colors flex items-center">' +
  MAGNIFIER + '</button>\n';

// Mobile: wrap a search button + the existing hamburger so they stay grouped
// on the right of the bar.
const HAMBURGER_RE = /<button onclick="document\.getElementById\('mob-nav'\)\.classList\.toggle\('hidden'\)" class="md:hidden text-f1-text">\s*<svg[\s\S]*?<\/svg><\/button>/;
const HAMBURGER_NEW =
  '<div class="flex md:hidden items-center gap-3">' +
  '<button type="button" onclick="PLS_openSearch()" aria-label="Search" class="text-f1-text hover:text-f1-red transition-colors">' +
  MAGNIFIER_LG + '</button>' +
  '<button onclick="document.getElementById(\'mob-nav\').classList.toggle(\'hidden\')" class="text-f1-text">' +
  '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg></button>' +
  '</div>';

const SCRIPT_TAG = '<script src="/search.js" defer></script>\n';

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.html')) out.push(full);
  }
}

const files = [];
walk(ROOT, files);

let injected = 0, skipped = 0, noNav = 0, noHamburger = 0, noBody = 0;

for (const file of files) {
  let html = fs.readFileSync(file, 'utf8');
  if (html.indexOf(SENTINEL) !== -1) { skipped++; continue; }

  let changed = false;

  // 1. Desktop button before the first main-nav close.
  const navIdx = html.indexOf('</nav>');
  if (navIdx !== -1) {
    html = html.slice(0, navIdx) + DESKTOP_BTN + html.slice(navIdx);
    changed = true;
  } else {
    noNav++;
  }

  // 2. Mobile button + hamburger wrapper.
  if (HAMBURGER_RE.test(html)) {
    html = html.replace(HAMBURGER_RE, HAMBURGER_NEW);
    changed = true;
  } else {
    noHamburger++;
  }

  // 3. Script tag before </body>.
  const bodyIdx = html.lastIndexOf('</body>');
  if (bodyIdx !== -1) {
    html = html.slice(0, bodyIdx) + SCRIPT_TAG + html.slice(bodyIdx);
    changed = true;
  } else {
    noBody++;
  }

  if (changed) {
    fs.writeFileSync(file, html);
    injected++;
  }
}

console.log(`Scanned ${files.length} HTML files`);
console.log(`  injected: ${injected}`);
console.log(`  skipped (already had search): ${skipped}`);
console.log(`  missing main nav: ${noNav}`);
console.log(`  missing hamburger: ${noHamburger}`);
console.log(`  missing </body>: ${noBody}`);
