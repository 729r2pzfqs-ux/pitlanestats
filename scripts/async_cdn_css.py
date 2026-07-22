#!/usr/bin/env python3
"""Load the two third-party stylesheets without blocking first render.

Google Fonts and Font Awesome sit in <head> as plain stylesheets, so paint waits
on two extra CDN round-trips. Swapping them to media="print" makes the browser
fetch at low priority without blocking, and the onload handler promotes them to
all media once they arrive. A <noscript> copy keeps them working with JS off.
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {".git", ".venv", "__pycache__"}

FONTS_URL = (
    "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700"
    "&family=Inter:wght@300;400;500;600&display=swap"
)
FA_ATTRS = (
    'integrity="sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+'
    'Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==" '
    'crossorigin="anonymous" referrerpolicy="no-referrer"'
)
FA_URL = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"

REPLACEMENTS = [
    (
        f'<link href="{FONTS_URL}" rel="stylesheet">',
        f'<link href="{FONTS_URL}" rel="stylesheet" media="print" '
        f"onload=\"this.media='all'\">"
        f'<noscript><link href="{FONTS_URL}" rel="stylesheet"></noscript>',
    ),
    (
        f'<link rel="stylesheet" href="{FA_URL}" {FA_ATTRS} />',
        f'<link rel="stylesheet" href="{FA_URL}" {FA_ATTRS} media="print" '
        f"onload=\"this.media='all'\" />"
        f'<noscript><link rel="stylesheet" href="{FA_URL}" {FA_ATTRS} /></noscript>',
    ),
]


def main():
    changed = 0
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            if not fn.endswith(".html"):
                continue
            path = os.path.join(dirpath, fn)
            with open(path, encoding="utf-8") as fh:
                html = fh.read()
            new = html
            for old, repl in REPLACEMENTS:
                # Guard against double-application on re-run.
                if repl not in new:
                    new = new.replace(old, repl)
            if new != html:
                with open(path, "w", encoding="utf-8") as fh:
                    fh.write(new)
                changed += 1
    print(f"pages with async CDN stylesheets: {changed}")


if __name__ == "__main__":
    main()
