#!/usr/bin/env python3
"""Normalise the site-wide ticker and the headline counts it quotes.

Counts are derived from what is actually on disk (live pages, ignoring the
noindex redirect stubs) rather than hardcoded, so re-running this after adding
a race or driver keeps every surface in step.

The "most titles" record is pinned to the wording used by the authoritative
records page: Schumacher and Hamilton are tied on 7.
"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".venv", "__pycache__", "scripts", "tools", "css"}

MOST_TITLES = "M. Schumacher &amp; L. Hamilton (7)"


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def is_stub(html):
    return 'http-equiv="refresh"' in html


def live_pages(subdir, depth):
    """Count live index.html pages `depth` levels below `subdir`."""
    base = os.path.join(ROOT, subdir)
    found = 0
    for dirpath, dirnames, filenames in os.walk(base):
        rel = os.path.relpath(dirpath, base)
        level = 0 if rel == "." else len(rel.split(os.sep))
        if level != depth:
            continue
        if "index.html" not in filenames:
            continue
        if not is_stub(read(os.path.join(dirpath, "index.html"))):
            found += 1
    return found


def count_races():
    base = os.path.join(ROOT, "races")
    total = 0
    for year in os.listdir(base):
        if not re.fullmatch(r"\d{4}", year):
            continue
        for name in os.listdir(os.path.join(base, year)):
            page = os.path.join(base, year, name, "index.html")
            if os.path.exists(page) and not is_stub(read(page)):
                total += 1
    return total


def count_drivers():
    base = os.path.join(ROOT, "drivers")
    total = 0
    for name in os.listdir(base):
        if name in ("nationality", "page"):
            continue
        page = os.path.join(base, name, "index.html")
        if os.path.exists(page) and not is_stub(read(page)):
            total += 1
    return total


def count_seasons():
    base = os.path.join(ROOT, "seasons")
    return sum(
        1
        for name in os.listdir(base)
        if re.fullmatch(r"\d{4}", name)
        and os.path.exists(os.path.join(base, name, "index.html"))
        and not is_stub(read(os.path.join(base, name, "index.html")))
    )


def main():
    races, drivers, seasons = count_races(), count_drivers(), count_seasons()
    print(f"computed from disk: {races} races, {drivers} drivers, {seasons} seasons")

    rules = [
        # The records page has Schumacher and Hamilton tied; the ticker used to
        # credit Schumacher alone. Normalise all three wordings seen in the tree.
        (re.compile(r"Most Titles: (?:Michael Schumacher \(7\)"
                    r"|Schumacher &(?:amp;)? Hamilton \(7\)"
                    r"|M\. Schumacher &(?:amp;)? L\. Hamilton \(7\))"),
         f"Most Titles: {MOST_TITLES}"),
        (re.compile(r"[\d,]+ Races in Database"), f"{races:,} Races in Database"),
        (re.compile(r"[\d,]+ Drivers Tracked"), f"{drivers:,} Drivers Tracked"),
        (re.compile(r"\d+ Seasons Since 1950"), f"{seasons} Seasons Since 1950"),
        # Headline counts quoted in metadata and hero copy.
        (re.compile(r"[\d,]+ Drivers, [\d,]+ Races, \d+ Seasons"),
         f"{drivers:,} Drivers, {races:,} Races, {seasons} Seasons"),
        (re.compile(r"[\d,]+ drivers, [\d,]+ races and \d+ seasons"),
         f"{drivers:,} drivers, {races:,} races and {seasons} seasons"),
        (re.compile(r"[\d,]+ races across"), f"{races:,} races across"),
        (re.compile(r"All [\d,]+ F1 Races"), f"All {races:,} F1 Races"),
    ]

    targets = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        targets += [os.path.join(dirpath, f) for f in filenames if f.endswith(".html")]
    # The drivers index build template carries the same ticker, so keep it in
    # step or the next build reintroduces the stale numbers.
    targets.append(os.path.join(ROOT, "scripts", "drivers_index_template.html"))

    changed = 0
    for path in targets:
        html = read(path)
        new = html
        for pattern, repl in rules:
            new = pattern.sub(repl, new)
        if new != html:
            write(path, new)
            changed += 1
    print(f"pages updated: {changed}")

    # The homepage stat tile is a bare number with a "Races" label beneath it.
    home = os.path.join(ROOT, "index.html")
    html = read(home)
    new = re.sub(
        r'(<div class="text-3xl font-heading font-bold text-f1-white">)[\d,]+'
        r'(</div><div class="text-f1-text text-sm mt-1">Races</div>)',
        lambda m: f"{m.group(1)}{races:,}{m.group(2)}",
        html,
    )
    if new != html:
        write(home, new)
        print("homepage race stat tile updated")


if __name__ == "__main__":
    main()
