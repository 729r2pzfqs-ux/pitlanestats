#!/usr/bin/env python3
"""Regenerate sitemap.xml with lastmod dates that reflect reality.

The previous sitemap carried a single hand-set stamp, so 2,527 entries claimed
2026-07-15 for pages that had actually changed later. Here each entry's lastmod
comes from the page itself:

  * a page with uncommitted edits (or one not yet tracked) is dated today,
    because that is when its content last changed;
  * otherwise the date of the commit that last touched it.

Excluded: 404.html and every noindex redirect stub (detected by the meta
refresh), matching what the sitemap has always covered.
"""
import datetime
import os
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pitlanestats.com"
SKIP_DIRS = {".git", ".venv", "__pycache__", "scripts", "tools"}


def git(*args):
    return subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout


def commit_dates():
    """repo-relative path -> YYYY-MM-DD of the commit that last touched it."""
    dates = {}
    current = None
    out = git("log", "--pretty=format:C%cs", "--name-only", "--no-renames")
    for line in out.splitlines():
        if line.startswith("C") and len(line) == 11:
            current = line[1:]
        elif line.strip() and current:
            dates.setdefault(line.strip(), current)
    return dates


def dirty_paths():
    """Paths with working-tree changes or not yet tracked.

    In -z output each record is "XY <path>", and a rename or copy is followed by
    a second field holding the original path. That trailing field has to be
    consumed explicitly, otherwise it is mistaken for another record.
    """
    # --untracked-files=all lists new files individually; the default collapses
    # them to the containing directory, which would not match a file path.
    fields = git("status", "--porcelain", "-z", "--untracked-files=all").split("\0")
    paths = set()
    i = 0
    while i < len(fields):
        record = fields[i]
        i += 1
        if len(record) < 4:
            continue
        status, path = record[:2], record[3:]
        paths.add(path)
        if "R" in status or "C" in status:
            i += 1  # skip the original path of a rename/copy
    return paths


def main():
    today = datetime.date.today().isoformat()
    dates = commit_dates()
    dirty = dirty_paths()

    entries = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in sorted(filenames):
            if not fn.endswith(".html") or fn == "404.html":
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, ROOT)
            with open(path, encoding="utf-8") as fh:
                html = fh.read()
            if 'http-equiv="refresh"' in html:
                continue
            url = "/" + (rel[: -len("index.html")] if fn == "index.html" else rel)
            lastmod = today if rel in dirty else dates.get(rel, today)
            entries.append((url, lastmod))

    entries.sort()
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    lines += [
        f"  <url><loc>{SITE}{url}</loc><lastmod>{lastmod}</lastmod></url>"
        for url, lastmod in entries
    ]
    lines.append("</urlset>")

    with open(os.path.join(ROOT, "sitemap.xml"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")

    spread = {}
    for _url, lastmod in entries:
        spread[lastmod] = spread.get(lastmod, 0) + 1
    print(f"sitemap entries: {len(entries)}")
    for date in sorted(spread):
        print(f"  {date}: {spread[date]}")


if __name__ == "__main__":
    main()
