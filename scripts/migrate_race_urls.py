#!/usr/bin/env python3
"""One-off migration: /races/<year>/<round>/ -> /races/<year>/<gp-slug>/

Also stamps the season year into every race <h1>, rewrites every reference to
the old numeric paths across the site, and leaves a noindex redirect stub at
each old URL.

Safe to run once; re-running is a no-op because the numeric directories that
remain are redirect stubs and are skipped.
"""
import json
import os
import re
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://pitlanestats.com"

STUB = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Redirecting…</title>
<meta http-equiv="refresh" content="0; url={path}">
<link rel="canonical" href="{site}{path}">
<meta name="robots" content="noindex">
</head>
<body>
<p>This page has moved to <a href="{path}">{site}{path}</a></p>
</body>
</html>
"""


def slugify(text):
    text = text.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def build_map():
    """(year, round) -> (grand prix name, slug), skipping redirect stubs."""
    mapping = {}
    races = os.path.join(ROOT, "races")
    for year in sorted(os.listdir(races)):
        if not re.fullmatch(r"\d{4}", year):
            continue
        for rnd in sorted(os.listdir(os.path.join(races, year))):
            page = os.path.join(races, year, rnd, "index.html")
            if not re.fullmatch(r"\d+", rnd) or not os.path.exists(page):
                continue
            html = read(page)
            if 'http-equiv="refresh"' in html:
                continue
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", html, re.S)
            name = re.sub(r"<[^>]+>", "", h1.group(1)).strip()
            mapping[(year, rnd)] = (name, slugify(name))
    return mapping


def rewrite_refs(text, mapping):
    def sub(match):
        year, rnd = match.group(1), match.group(2)
        entry = mapping.get((year, rnd))
        return match.group(0) if entry is None else f"races/{year}/{entry[1]}/"

    return re.sub(r"races/(\d{4})/(\d+)/", sub, text)


def main():
    mapping = build_map()
    print(f"race pages to migrate: {len(mapping)}")
    collisions = {}
    for (year, rnd), (_, slug) in mapping.items():
        collisions.setdefault((year, slug), []).append(rnd)
    dupes = {k: v for k, v in collisions.items() if len(v) > 1}
    if dupes:
        raise SystemExit(f"slug collisions, aborting: {dupes}")

    # 1. Stamp the year into each race H1 while the page is still in place.
    for (year, rnd), (name, _slug) in mapping.items():
        page = os.path.join(ROOT, "races", year, rnd, "index.html")
        html = read(page)
        titled = f"{name} {year}"
        new = re.sub(
            r"(<h1[^>]*>)\s*" + re.escape(name) + r"\s*(</h1>)",
            lambda m: m.group(1) + titled + m.group(2),
            html,
            count=1,
        )
        if new == html:
            raise SystemExit(f"H1 rewrite failed for {page}")
        write(page, new)
    print("H1s stamped with season year")

    # 2. Rewrite every reference to the old numeric race paths, site-wide.
    touched = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", ".venv", "__pycache__")]
        for fn in filenames:
            if not fn.endswith((".html", ".json", ".js", ".xml", ".txt")):
                continue
            path = os.path.join(dirpath, fn)
            html = read(path)
            new = rewrite_refs(html, mapping)
            if new != html:
                write(path, new)
                touched += 1
    print(f"files with rewritten race links: {touched}")

    # 3. Search index: make race keywords include the GP name, not just a round.
    index_path = os.path.join(ROOT, "search-index.json")
    entries = json.loads(read(index_path))
    slug_to_name = {(y, s): n for (y, _r), (n, s) in mapping.items()}
    for entry in entries:
        m = re.fullmatch(r"/races/(\d{4})/([a-z0-9-]+)/", entry[1])
        if not m:
            continue
        name = slug_to_name.get((m.group(1), m.group(2)))
        if name:
            entry[3] = f"{m.group(1)} {name.lower()}"
    write(index_path, json.dumps(entries, ensure_ascii=False, separators=(",", ":")))
    print("search index keywords refreshed")

    # 4. git mv each numeric directory to its slug, then leave a redirect stub.
    for (year, rnd), (_name, slug) in sorted(mapping.items()):
        old = os.path.join(ROOT, "races", year, rnd)
        new = os.path.join(ROOT, "races", year, slug)
        subprocess.run(["git", "mv", old, new], cwd=ROOT, check=True)
        os.makedirs(old, exist_ok=True)
        write(
            os.path.join(old, "index.html"),
            STUB.format(path=f"/races/{year}/{slug}/", site=SITE),
        )
    print(f"moved {len(mapping)} race pages and wrote redirect stubs")


if __name__ == "__main__":
    main()
