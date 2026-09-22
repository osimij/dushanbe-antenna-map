# Dushanbe module map — Tojikelectrocomplect & Baylan

The default map now shows **Ноҳияи Сино** using the individual March–May 2026
installation registers in `new-files/`, with module IDs tied to their recorded
addresses. The previous citywide planning estimate is preserved in `city-map.html`
and is linked from the main view.

- **5,873 distinct full module IDs** are included in the Sino view.
- **5,041 modules** are placed at **644 matched buildings** inside the 2GIS Sino boundary.
- **832 modules** remain under **Уточнить**, with no fabricated coordinates.
- **126 source rows** contain shortened or malformed IDs. Their original text is
  retained in the review list; full IDs from those rows are counted separately.
- Search by street, house, or Module ID. Click a building or list entry to see
  every module's original address and source workbook, sheet, and row.
- Multiple modules at one building share a single pin. Zoom in to see the count;
  no modules are scattered into adjacent houses.
- Gateway relationships come from the existing `Meters_per_Gateway.xlsx` ID lists.
  IDs absent from those lists have no claimed gateway assignment.
- CSV export includes all source occurrences, match status, coordinates only for
  matched addresses, gateway IDs, and source references. Repeated source occurrences
  do not add extra map modules. Count unique full IDs when analysing the export.

## Run locally

This is a static site with no build step:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

The street-map background works immediately using OpenStreetMap. An optional
Yandex Tiles key can be added in `map-config.js`; with a valid key, Yandex is used.
If Yandex rejects the key, the background falls back to OpenStreetMap. Both views
use the same background setup, and module locations are independent of the provider.
OpenStreetMap tiles use normal browser caching and visible attribution, following
the [tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Address matching and limitations

The Sino view includes all full IDs from sheets explicitly marked `Нохияи Сино`,
other rows on those same streets, and additional March addresses whose exact
building is independently matched inside Sino. Other unverified March streets stay
in the previous citywide view.

House numbers and apartment numbers are parsed separately. Quarter references are
retained: for example `Испечак, М25, дом 5` searches for `Испечак, 5-М25`, and
`Зарафшон, М4, дом 5` searches for `Зарафшон, 5/4`. Original address text remains
visible. A pin requires a unique matching street and full house number, a Sino
administrative label, and coordinates inside the catalog's district polygon.

This checks the **public map address**, not a field survey of the installed meter.
Unnumbered houses, unresolved block Б-1 designations, multiple building matches,
and conflicting addresses for the same module ID remain in the review list.
Shortened IDs are not expanded by guessing digits. Source files and subscriber
names, phone numbers, account numbers, and meter readings are not served by the app.

Address and boundary evidence was checked on 23 September 2026 using the public
[2GIS catalog](https://2gis.tj/ru/dushanbe/geo/70030077013570949). Per-address evidence
is stored in `data/sino-address-catalog.json`; input file hashes are in `sino-data.js`.
No geocoding service is called when a user opens the app.

## Rebuild and check

With Python and `openpyxl` available and the original workbooks in `new-files/`:

```bash
python3 scripts/sino_addresses.py --prepare
python3 scripts/sino_addresses.py --fetch --extra
python3 scripts/sino_addresses.py --build
python3 -m unittest discover -s tests -v
```

Public address lookups are cached in the ignored `.address-work/` directory.
The generated `sino-data.js` and the catalog evidence are committed with the site.
`tests/sino-browser.cjs` checks desktop and mobile search, building details, review
filters, CSV export, and the previous citywide view using Playwright against the
running local server. `NODE_PATH` can point at the bundled Playwright installation.

## Connect the free Yandex map

1. Sign in to [Yandex Developer Dashboard](https://developer.tech.yandex.ru/).
2. Connect **Tiles API** and create its API key (not a JavaScript API or Geocoder key).
3. Paste the key into `yandexTilesApiKey` in `map-config.js`.
4. Restrict that browser key to your deployed domain in Yandex; allow your localhost
   development address separately when testing. Newly issued keys can take 15 minutes
   to activate. Confirm the free Tiles plan is available for your account.
5. Reload the app. Without a key, OpenStreetMap supplies the background automatically.

The key is used in browser requests and is not a server secret. Never put other
credentials in `map-config.js`. The Yandex logo and terms link are shown when Yandex
is active; OpenStreetMap attribution is shown when the fallback is active.

As checked on 22 September 2026, [Yandex's terms, sections 6.5.1–6.5.2](https://yandex.ru/legal/maps_api/ru/)
permit Tiles API in closed/internal systems with your own data overlaid, up to 30
requests/second. [The product page](https://yandex.ru/maps-api/products/tiles-api)
describes the free offer as ongoing, not a trial. Normal browser caching is used;
there is no offline tile downloader or permanent tile storage.

The official Yandex logo in `assets/yandex-logo.svg` comes from the archive linked
in the [Tiles API documentation](https://yandex.ru/maps-api/docs/tiles-api/index.html).

## Deploy to Vercel

This repo is Vercel-ready (static site, zero build).

**Option A — Dashboard**
1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. Framework Preset: **Other** · Build Command: *(none)* · Output Directory: `./`
3. Click **Deploy**.

**Option B — CLI**
```bash
npm i -g vercel
vercel        # preview deploy
vercel --prod # production deploy
```

`vercel.json` sets clean URLs and disables caching of `index.html` so data updates
show up immediately. The Excel source and backup files are excluded via `.vercelignore`.


*Contains internal infrastructure data — keep this repository private.*
