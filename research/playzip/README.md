# PlayZip catalogue inspection

Inspected with curl on 2026-10-15. This investigation is separate from Orbit's running application.

## Finding

The inspected frontend does not call a JSON catalogue API. Game cards are server-rendered into the initial HTML. Search, category, sort, and page changes navigate to new HTML documents. Sending `Accept: application/json` still returned `Content-Type: text/html; charset=utf-8` in the search check.

This identifies the public catalogue interface. It does not establish that the server has no other private or undocumented APIs.

## Read routes

| Purpose | Method and route |
| --- | --- |
| Catalogue | `GET https://playzip.com/` |
| Search | `GET /?keywords=Stardew` |
| Pagination | `GET /?page=2` |
| Latest order | `GET /?sort=latest` |
| Category | `GET /category/indie` |
| Combined filters | `GET /category/indie?page=2&sort=latest&l=english` |
| Game details | `GET /game/2728` |
| Public URL inventory | `GET /sitemap.xml` |

Query parameters are `keywords`, `page`, `sort`, and `l`. The frontend uses `sort=latest` for latest ordering and otherwise selects its views ordering. Language values are `english` and `schinese`. Page numbers start at 1. The inspected homepage contained 30 cards and reported 96 pages. These counts can change.

Category slugs come from the inline frontend map: `all`, `shooting`, `casual`, `action`, `sports_racing`, `adventure`, `simulation`, `r18`, `rpg`, `strategy`, `fighting`, `horror`, `rts`, `card`, `indie`, `lan`. The all-category route is `/`.

No credentials or cookies were needed for the catalogue requests tested. No authentication cookies from the inline script were copied or used.

```powershell
curl.exe -L "https://playzip.com/?keywords=Stardew&sort=latest&l=english"
curl.exe -L "https://playzip.com/category/indie?page=2&sort=latest&l=english"
```

## Extraction contract

Each catalogue card is `a.game_item`:

| Output field | HTML source |
| --- | --- |
| `id` | Numeric ID in the card's `/game/{id}` link |
| `url` | Absolute form of that link |
| `name` | `img`'s `alt` attribute |
| `coverUrl` | `img`'s `data-src`, falling back to `src` |
| `steamAppId` | Numeric app ID in `/steam/apps/{id}/` inside the image URL |

Steam app IDs and PlayZip game IDs are different. For example, the inspected Black Myth: Wukong card has PlayZip ID `2728` and Steam app ID `2358720`.

The adapter uses Python's standard library and emits this metadata as JSON, plus `page`, `totalPages`, and the page's result `count`. It makes one request per invocation and does not crawl the full catalogue.

```powershell
python scripts/playzip-catalogue.py --keywords Stardew
python scripts/playzip-catalogue.py --category indie --sort latest --page 2
python scripts/playzip-catalogue.py --from-file research/playzip/playzip-home.html
```

Game details are also HTML. The inspected detail page includes JSON-LD metadata with title, image, category, publication date, and modification date. Its description mixes editorial notices with game text, so it is not a clean canonical game description.

The only same-origin API fetch found in the inspected homepage is `POST /api/gameRequest`, a game suggestion form with `gameName`, `steamUrl`, and `note` fields. It is unrelated to reading the catalogue and was not called. Advertising, analytics, and download paths were not followed.

The saved HTML, response headers, and sitemap in this folder are the inspection evidence. This adapter depends on the site's current markup and should fail visibly if it changes.
