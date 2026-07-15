#!/usr/bin/env node
/*
 * generate-search-index.js
 *
 * Scans the static PitlaneStats HTML pages and builds a compact JSON search
 * index consumed by /search.js. Run from the repo root:
 *
 *     node tools/generate-search-index.js
 *
 * Output: /search-index.json
 *
 * Each entry is a 4-tuple [title, url, section, keywords] to keep the file
 * small. `url` is a root-relative path (works from any page depth because the
 * site is served at the domain root).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Top-level dir -> human section label. Order also defines a coarse priority
// (earlier = ranked slightly higher when scores tie).
const SECTIONS = [
  ['drivers', 'Driver'],
  ['constructors', 'Team'],
  ['circuits', 'Circuit'],
  ['circuit-records', 'Circuit Records'],
  ['seasons', 'Season'],
  ['races', 'Race'],
  ['decades', 'Decade'],
  ['on-this-day', 'On This Day'],
  ['battles', 'Battle'],
  ['head-to-head', 'Head-to-Head'],
  ['records', 'Records'],
  ['wet-weather', 'Wet Weather'],
  ['reliability', 'Reliability'],
  ['form-guide', 'Form Guide'],
  ['points-history', 'Points'],
  ['rookie-seasons', 'Rookie Seasons'],
  ['calendar', 'Calendar'],
  ['about', 'About'],
];

const SITE_SUFFIX = /\s*[|—–]\s*PitlaneStats\s*$/i;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.name === 'index.html') {
      out.push(full);
    }
  }
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1].replace(/\s+/g, ' ').trim());
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function urlFor(file) {
  // /Users/.../pitlanestats/drivers/hamilton/index.html -> /drivers/hamilton/
  let rel = path.relative(ROOT, path.dirname(file)).split(path.sep).join('/');
  return '/' + (rel ? rel + '/' : '');
}

function cleanTitle(raw) {
  let t = raw.replace(SITE_SUFFIX, '').trim();
  // Display title = part before the first em/en dash descriptor, but keep the
  // descriptor as a keyword.
  return t;
}

const index = [];
let total = 0;

for (const [dir, label] of SECTIONS) {
  const files = [];
  walk(path.join(ROOT, dir), files);
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    // Skip redirect stubs and pages excluded from indexing.
    if (/<meta[^>]+http-equiv=["']refresh["']/i.test(html)) continue;
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) continue;
    const rawTitle = extractTitle(file ? html : '');
    if (!rawTitle) continue;
    const url = urlFor(file);
    const full = cleanTitle(rawTitle);

    // Split a descriptor off the display title ("Lewis Hamilton — F1 Career
    // Stats" -> display "Lewis Hamilton", keyword "F1 Career Stats").
    let display = full;
    let descriptor = '';
    const dash = full.split(/\s+[—–]\s+/);
    if (dash.length > 1) {
      display = dash[0].trim();
      descriptor = dash.slice(1).join(' ').trim();
    }

    // Slug words from the URL add matchable tokens (e.g. red_bull, alonso-vs-ocon).
    const slug = url
      .replace(/^\/|\/$/g, '')
      .split('/')
      .slice(1)
      .join(' ')
      .replace(/[_-]+/g, ' ')
      .trim();

    const kw = [descriptor, slug]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    index.push([display, url, label, kw]);
    total++;
  }
}

const outPath = path.join(ROOT, 'search-index.json');
fs.writeFileSync(outPath, JSON.stringify(index));

const bytes = fs.statSync(outPath).size;
console.log(`Indexed ${total} pages -> search-index.json (${(bytes / 1024).toFixed(1)} KB)`);

// Per-section summary
const counts = {};
for (const [, , s] of index) counts[s] = (counts[s] || 0) + 1;
for (const [s, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${s}`);
}
