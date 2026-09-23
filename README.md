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

The street-map background uses **2GIS MapGL JS API**, restoring the vector map
introduced in commit `e9e92b3`. Both Sino and the legacy citywide view share this
setup. `dgis-layer.js` keeps the 2GIS camera aligned with the existing Leaflet
building dots, gateway overlays, search, and mobile controls. The native 2GIS logo
and copyright remain visible and clickable.

The compass in the bottom-right corner switches between **3D** (45° tilt) and
**2D**. Its side arrows rotate the map; the red north arrow restores north-up.
Ctrl + mouse drag also starts rotation. In 3D, phones use 2GIS's two-finger
rotation and tilt gestures. Both maps support these controls. `dgis-view.js`
mirrors the visible building dots, gateways, coverage circles, and boundary into
native 2GIS overlays so they remain geographically aligned when tilted. Search,
filters, and building details remain connected to the same underlying data.
“Показать все” returns to the flat overview. The compass is only shown when
2GIS is available; fallback backgrounds keep their existing flat controls.

Set `provider: '2gis'` and `dgisApiKey` in `map-config.js`. The key must have access
to [2GIS MapGL JS API](https://docs.2gis.com/en/mapgl/start/first-steps). This uses
MapGL vector maps, not the separately enabled Raster Tiles API. Browser keys are
public by design; configure the allowed website domains in the provider account.

If 2GIS cannot load, rejects the key, or loses WebGL support, the map tries Google
Maps using the existing key, then OpenStreetMap. The provider badge explicitly
identifies the fallback. To use Google first, set `provider: 'google'`.
OpenStreetMap retains visible attribution and follows its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

## Phones and performance

Both maps share `app.css` (panel, bottom sheet, list) and `ui.js` (touch drags,
the bottom sheet, eased scrolling, and a Leaflet canvas renderer whose taps pick
the nearest dot).

- On phones the panel is a bottom sheet. Drag or flick its handle, or tap the map,
  to fold it away. The sheet scrolls as one page, keeping the handle and the export
  buttons pinned; short windows and landscape phones get the same treatment.
- Choosing an address folds the list away, glides the map to the building (which
  stays highlighted), and opens its details as a sheet that can be swiped down.
  Enter in the search box opens a single result or frames several on the map.
- Buildings are drawn on one canvas, not as hundreds of DOM markers, so zooming
  and panning stay smooth on low-end phones. Touch screens snap to whole zoom
  levels, which keeps Google tiles crisp and loads a third as many of them.
- The address list renders 50 rows at a time as you scroll, and fast typing is
  coalesced. The map container exposes `data-visible-buildings` for tests.
- Motion uses transforms and opacity only, and respects reduced-motion settings.

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
filters, the paged list, CSV export, and the previous citywide view using Playwright
against the running local server, for example
`node tests/sino-browser.cjs http://localhost:8000`. `NODE_PATH` can point at the
bundled Playwright installation. `node --test tests/map-background.cjs` covers the
2GIS/Google/OpenStreetMap loading and fallback behavior.
`node tests/dgis-browser.cjs http://127.0.0.1:8001` checks the live 2GIS provider,
clickable attribution, building alignment after zooming and panning, and both map
views on desktop and mobile. It requires an active 2GIS key and WebGL support.
`node tests/dgis-3d-browser.cjs http://127.0.0.1:8001` checks tilt, rotation,
building selection, search/filter updates, citywide popups, and recovery to flat
controls when the provider fails, on both desktop and mobile.

## Configure the Google Maps fallback

1. In [Google Cloud Console](https://console.cloud.google.com/), select the map's project.
2. Enable **Maps JavaScript API** and link an active billing account.
3. Create a browser API key restricted to **Maps JavaScript API**.
4. Add website restrictions for `https://dushanbe-antenna-map.vercel.app/*`,
   `http://localhost:8000/*`, and any other exact deployment domain in use.
5. Set `googleMapsApiKey` in `map-config.js`. This browser key is visible by design;
   do not put service account credentials or other secrets in this file.
6. To check Google directly, temporarily set `provider: 'google'`, refresh, and
   confirm the provider badge says **Google Maps** and Google's
   logo and map-data attribution are visible. A working fallback alone does not
   mean that the Google key or billing is configured correctly.

As checked on 23 September 2026, the standard Dynamic Maps SKU includes 10,000
free map loads per month, then $7 per 1,000 at the first paid tier. Billing must
still be enabled. Other APIs and other projects on the same billing account can
have their own usage; this is not a guarantee of zero charges. See
[Google's pricing](https://developers.google.com/maps/billing-and-pricing/pricing).
The app creates one Google map instance per page load, and does not recreate it
when searching or filtering modules. API-key restrictions and usage quotas should
be configured in the console; budget alerts alone do not stop charges.

The old Yandex adapter and logo are retained in the repository for reference, but
neither map loads or uses that adapter.

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
