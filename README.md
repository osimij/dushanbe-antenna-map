# Dushanbe module map — Tojikelectrocomplect & Baylan

The map uses **only `final-dataset.xlsx`** for installed modules and their recorded
addresses. The former estimated citywide placements have been removed.
`city-map.html` redirects old bookmarks to the current register.

## Source reconciliation

- All **7,797 workbook rows** are retained. The workbook declares **9,015 modules**.
- There are **8,799 distinct complete module IDs** after normalization.
- The parsed row lists contain **8,907 ID occurrences**, including **108 repeats
  across rows**. Another **108** of the declared count require reconciliation:
  incomplete/malformed IDs or repeated IDs within the same row.
- **101 source rows** have an ID/count issue. They remain in the review queue and
  CSV export. The application does not guess missing digits.
- **5,934 modules** are located at **983 matched buildings**. **2,865 complete
  IDs** remain in address review, in addition to the 101 ID/count issue rows.
  The live mapped/pending/building totals are generated in `SINO_DATA.summary`.
  Every source row, including rows without a valid ID, is covered by the modules
  and/or ID review entries. Repeated occurrences do not add duplicate map modules.

A pin requires a unique public 2GIS building match for the street, full house
number and any numbered passage, in Dushanbe. The full register is included;
records are no longer limited to the Sino district. The Sino boundary remains an
optional reference overlay.

House, apartment, quarter and block numbers are treated separately. Missing house
numbers, uncertain blocks, ambiguous catalog results and conflicting addresses
for the same ID remain under **Уточнить**, without fabricated coordinates.
Multiple modules at the same building share one marker and a module count.
Catalog matching verifies an address, not the physical installation of a meter.

Search by address or Module ID, select a building to inspect original addresses
and source rows, and export all records as CSV. The header distinguishes the
unique ID count from the workbook's declared total. CSV source text is protected
against accidental spreadsheet formula execution.

The eight existing gateways and their source ID relationships are retained.
Displayed gateway totals are calculated from the new register. No module is
assigned to a gateway by proximity. `data/gateway-modules.json` contains the ID
relationships extracted from the previous gateway register, without old module
coordinates.

## Map interaction and responsive layout

2GIS MapGL handles the native map, markers, panning and continuous fractional
zoom in both 2D and 3D. Leaflet's stepped wheel/touch zoom is disabled while the
native camera is active. It only receives the settled camera state, avoiding a
second animation that could interrupt trackpad gestures.

- Trackpads, mouse wheels and touchscreen pinch gestures use the same camera.
- The compass tilts and rotates the map. Resetting to 2D keeps continuous zoom.
- The map supports keyboard arrow and zoom keys, plus visible zoom controls.
- Data changes are batched to animation frames; unchanged point data is not sent
  to the GPU again after panning. Building dots share a native GeoJSON source.
- The address list renders 50 rows at a time and coalesces fast search input.
- On phones the list and building details use collapsible bottom sheets.
  Short landscape windows use a scrollable side panel.
- Reduced-motion preferences are respected for application camera/control actions.

If 2GIS fails, native overlays are removed and Leaflet interactions resume with
Google Maps, or OpenStreetMap if Google is unavailable. Provider labels and
attribution remain visible.

## Run and rebuild

This is a static website with no build step:

```sh
python3 -m http.server 8002
```

Open `http://localhost:8002`. To rebuild with Python and `openpyxl` available:

```sh
python3 scripts/final_dataset.py --fetch --build
```

The source workbook stays local. Public street/house lookups are cached under
`.address-work/catalog/`; failed lookups are recorded in `.final-work/` and are
not cached as successful results. Rebuild after adding corrections to the source.
`scripts/sino_addresses.py` supplies parsing/matching helpers; its historical
March–May import commands are not the current production workflow.

`sino-data.js` contains the generated application dataset and source SHA-256.
`data/sino-address-catalog.json` preserves match evidence and lookup dates.
Only addresses, module IDs, counts and source references are extracted. Subscriber
names, phone numbers, account numbers, readings and notes are not published.
The Excel workbooks, working caches, scripts, tests and output artifacts are
excluded from deployment by `.vercelignore`.

## Verification

```sh
python3 -m unittest discover -s tests -v
node --test tests/map-background.cjs
node tests/sino-browser.cjs http://127.0.0.1:8002
node tests/native-browser.cjs http://127.0.0.1:8002
node tests/dgis-3d-browser.cjs http://127.0.0.1:8002
node tests/responsive-browser.cjs http://127.0.0.1:8002
```

Browser tests require Playwright, Chromium and (for the responsive suite) WebKit.
Use `NODE_PATH` for an external Playwright installation and `BROWSER_EXECUTABLE`
for an installed Chrome binary. Native-map tests require network access and a
valid 2GIS key. The register-flow suite deliberately tests the raster fallback.

Coverage includes every source row, unique IDs, source totals, coordinate
evidence, no invented coordinates, house/block/apartment parsing, gateway ID
relationships, search, pagination, filters, details, CSV download, old URL
redirection, continuous wheel frames, touchscreen pinch, native marker picking,
tilt/rotation and provider-failure recovery. Responsive flows run in Chromium
and WebKit at desktop, tablet and narrow phone sizes; native gestures also cover
landscape phones. These are browser/device simulations, not physical-device
field tests.

## Hosting and map configuration

GitHub `main` is connected to Vercel production at
`https://dushanbe-antenna-map.vercel.app`. Push only after verification and check
the Vercel commit status and served dataset before announcing the update.

`map-config.js` selects 2GIS and provides public browser keys. Restrict these keys
to the deployment and local development domains in each provider's account.
2GIS uses MapGL JS API, not its separate Raster Tiles API. Google's fallback
requires Maps JavaScript API and billing. Provider prices and quotas must be
checked in the account; the application does not guarantee zero charges.

See the [2GIS MapGL documentation](https://docs.2gis.com/en/mapgl/reference/interface)
and [Google Maps setup guide](https://developers.google.com/maps/documentation/javascript/cloud-setup).
The app creates one background map per page, without reloading it on searches.
`map-info.html` explains provider terms and browser data flows.

This repository contains internal infrastructure data and should remain private.
