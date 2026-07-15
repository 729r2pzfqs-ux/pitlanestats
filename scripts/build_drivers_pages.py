#!/usr/bin/env python3
"""Regenerate the paginated All Drivers pages from drivers/drivers.json.

drivers/drivers.json is the single source of truth for the drivers index:
one entry per driver, [name, slug, nationality, titles, wins, podiums,
poles, starts, points], ordered by career wins desc (a driver whose win
count changes moves to the END of his new wins group).

To update driver stats after a race: edit drivers/drivers.json, then run

    python3 scripts/build_drivers_pages.py

from the repo root. This rewrites drivers/index.html (page 1) and
drivers/page/2/ ... drivers/page/N/ from scripts/drivers_index_template.html.
The on-page search box fetches drivers.json directly, so it always reflects
the JSON, but the static rows only update when this script is re-run.

If the driver count changes, update sitemap.xml (one URL per page) and the
"818" mentions in the template by hand.
"""
import json
import math
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PER_PAGE = 100
BASE = 'https://pitlanestats.com'

with open(os.path.join(REPO, 'drivers', 'drivers.json'), encoding='utf-8') as f:
    drivers = json.load(f)

with open(os.path.join(REPO, 'scripts', 'drivers_index_template.html'), encoding='utf-8') as f:
    template = f.read()

total = len(drivers)
pages = math.ceil(total / PER_PAGE)


def esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;')


def row_html(d):
    name, slug, nat, titles, wins, podiums, poles, starts, points = d
    return (
        '<tr class="border-b border-f1-border">\n'
        f'<td class="py-2.5 px-4"><a href="/drivers/{slug}/" class="font-medium hover:text-f1-red transition-colors">{esc(name)}</a></td>\n'
        f'<td class="py-2.5 px-4 text-f1-text">{esc(nat)}</td>\n'
        f'<td class="py-2.5 px-4 text-center font-heading font-bold text-f1-red">{titles}</td>\n'
        f'<td class="py-2.5 px-4 text-center">{wins}</td>\n'
        f'<td class="py-2.5 px-4 text-center">{podiums}</td>\n'
        f'<td class="py-2.5 px-4 text-center">{poles}</td>\n'
        f'<td class="py-2.5 px-4 text-center text-f1-text">{starts}</td>\n'
        f'<td class="py-2.5 px-4 text-center text-f1-text">{points}</td></tr>'
    )


def page_url(n):
    return f'{BASE}/drivers/' if n == 1 else f'{BASE}/drivers/page/{n}/'


def page_href(n):
    return '/drivers/' if n == 1 else f'/drivers/page/{n}/'


LINK_CLS = ('bg-f1-card border border-f1-border rounded-lg px-3.5 py-2 text-sm '
            'text-f1-text hover:text-f1-white hover:border-f1-red transition-colors')
CUR_CLS = 'bg-f1-red border border-f1-red rounded-lg px-3.5 py-2 text-sm font-semibold text-white'


def pagination_html(cur):
    parts = ['<nav id="dpager" aria-label="Drivers pages" class="flex flex-wrap items-center justify-center gap-2 mt-8">']
    if cur > 1:
        parts.append(f'<a href="{page_href(cur - 1)}" class="{LINK_CLS}">&larr; Prev</a>')
    for n in range(1, pages + 1):
        lo, hi = (n - 1) * PER_PAGE + 1, min(n * PER_PAGE, total)
        title = f'Drivers {lo}&ndash;{hi}'
        if n == cur:
            parts.append(f'<span class="{CUR_CLS}" aria-current="page" title="{title}">{n}</span>')
        else:
            parts.append(f'<a href="{page_href(n)}" class="{LINK_CLS}" title="{title}">{n}</a>')
    if cur < pages:
        parts.append(f'<a href="{page_href(cur + 1)}" class="{LINK_CLS}">Next &rarr;</a>')
    parts.append('</nav>')
    return '\n'.join(parts)


for n in range(1, pages + 1):
    lo = (n - 1) * PER_PAGE
    hi = min(n * PER_PAGE, total)
    chunk = drivers[lo:hi]

    if n == 1:
        title = 'All F1 Drivers | PitlaneStats'
        desc = (f'Complete statistics for all {total} Formula 1 drivers including wins, '
                'championships, and career records.')
        breadcrumb_nav = ('<nav aria-label="Breadcrumb" class="max-w-7xl mx-auto px-4 sm:px-6 py-3 text-sm">'
                          '<a href="/" class="text-f1-text hover:text-f1-white transition-colors">Home</a>'
                          '<span class="text-f1-border mx-2">/</span>'
                          '<span class="text-f1-white">Drivers</span></nav>')
        breadcrumb_ld = json.dumps({
            "@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
                {"@type": "ListItem", "position": 2, "name": "Drivers"},
            ]})
        out_path = os.path.join(REPO, 'drivers', 'index.html')
    else:
        title = f'All F1 Drivers – Page {n} of {pages} | PitlaneStats'
        desc = (f'Career statistics for all {total} Formula 1 drivers, ranked by wins – '
                f'page {n} of {pages} (drivers {lo + 1}–{hi}).')
        breadcrumb_nav = ('<nav aria-label="Breadcrumb" class="max-w-7xl mx-auto px-4 sm:px-6 py-3 text-sm">'
                          '<a href="/" class="text-f1-text hover:text-f1-white transition-colors">Home</a>'
                          '<span class="text-f1-border mx-2">/</span>'
                          '<a href="/drivers/" class="text-f1-text hover:text-f1-white transition-colors">Drivers</a>'
                          '<span class="text-f1-border mx-2">/</span>'
                          f'<span class="text-f1-white">Page {n}</span></nav>')
        breadcrumb_ld = json.dumps({
            "@context": "https://schema.org", "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{BASE}/"},
                {"@type": "ListItem", "position": 2, "name": "Drivers", "item": f"{BASE}/drivers/"},
                {"@type": "ListItem", "position": 3, "name": f"Page {n}"},
            ]})
        out_path = os.path.join(REPO, 'drivers', 'page', str(n), 'index.html')

    subtitle = f'{total} drivers who have competed in Formula 1, ranked by career wins.'
    status = f'Showing drivers {lo + 1}&ndash;{hi} of {total}. Use the search box to find any driver.'

    html = (template
            .replace('{{TITLE}}', title)
            .replace('{{DESC}}', desc)
            .replace('{{URL}}', page_url(n))
            .replace('{{BREADCRUMB_NAV}}', breadcrumb_nav)
            .replace('{{BREADCRUMB_LD}}', breadcrumb_ld)
            .replace('{{SUBTITLE}}', subtitle)
            .replace('{{STATUS}}', status)
            .replace('{{ROWS}}', ''.join(row_html(d) for d in chunk))
            .replace('{{PAGINATION}}', pagination_html(n)))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print(f'wrote {os.path.relpath(out_path, REPO)} ({hi - lo} drivers, {len(html) // 1024}KB)')

print(f'{pages} pages, {total} drivers')
