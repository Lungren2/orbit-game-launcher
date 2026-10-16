"""Read PlayZip's public HTML catalogue and emit metadata as JSON. No downloads."""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

ORIGIN = "https://playzip.com"
CATEGORIES = (
    "all", "shooting", "casual", "action", "sports_racing", "adventure",
    "simulation", "r18", "rpg", "strategy", "fighting", "horror", "rts",
    "card", "indie", "lan",
)


class CatalogueParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.games = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "a" and "game_item" in attrs.get("class", "").split():
            match = re.fullmatch(r"/game/(\d+)/?", attrs.get("href", ""))
            if match:
                self.current = {
                    "id": int(match.group(1)),
                    "url": urljoin(ORIGIN, attrs["href"]),
                    "name": None,
                    "coverUrl": None,
                    "steamAppId": None,
                }
        elif tag == "img" and self.current is not None:
            cover = attrs.get("data-src") or attrs.get("src")
            self.current["name"] = attrs.get("alt", "").strip()
            self.current["coverUrl"] = urljoin(ORIGIN, cover) if cover else None
            steam = re.search(r"/steam/apps/(\d+)/", cover or "")
            self.current["steamAppId"] = int(steam.group(1)) if steam else None

    def handle_endtag(self, tag):
        if tag == "a" and self.current is not None:
            if self.current["name"]:
                self.games.append(self.current)
            self.current = None


def parse_catalogue(document, url, requested_page=1):
    parser = CatalogueParser()
    parser.feed(document)
    pagination = re.search(
        r'<div\s+class=["\']pagination["\']\s*>\s*<a[^>]*>\s*(\d+)\s*/\s*(\d+)\s*</a>',
        document,
    )
    if not parser.games and "games_content" not in document:
        raise ValueError("Response is not a catalogue page, or the page structure changed.")
    return {
        "source": "playzip-html",
        "url": url,
        "page": int(pagination.group(1)) if pagination else requested_page,
        "totalPages": int(pagination.group(2)) if pagination else 1,
        "count": len(parser.games),
        "games": parser.games,
    }


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keywords")
    parser.add_argument("--category", choices=CATEGORIES, default="all")
    parser.add_argument("--sort", choices=("views", "latest"), default="views")
    parser.add_argument("--page", type=int, default=1)
    parser.add_argument("--language", choices=("english", "schinese"), default="english")
    parser.add_argument("--from-file", type=Path, help="Parse saved HTML without a network request")
    args = parser.parse_args()
    if args.page < 1:
        parser.error("--page must be at least 1")
    params = {"page": args.page, "sort": args.sort, "l": args.language}
    if args.keywords:
        params["keywords"] = args.keywords
    route = "/" if args.category == "all" else "/category/" + args.category
    url = ORIGIN + route + "?" + urlencode(params)
    if args.from_file:
        document = args.from_file.read_text(encoding="utf-8")
    else:
        request = Request(url, headers={"Accept": "text/html", "User-Agent": "Orbit-Catalogue-Inspection/1.0"})
        with urlopen(request, timeout=30) as response:
            if "text/html" not in response.headers.get("Content-Type", ""):
                raise ValueError("Expected an HTML catalogue response")
            document = response.read().decode("utf-8")
    json.dump(parse_catalogue(document, url, args.page), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
