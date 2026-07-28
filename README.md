# Dushanbe Antenna Map — Tojikelectrocomplect & Baylan

Interactive antenna registry map for **Tojikelectrocomplect & Baylan** in Dushanbe, Tajikistan.
Static files with **no build step**.

- **8,282 module slots** across **450 register rows** in **35 mahallas**
- **5,690 real Module IDs** assigned nearest-first while preserving each gateway's exact quota
- **2,592 farther slots** retain their nearest-gateway classification but have no fabricated ID
- The **2,506 modules in 30 rows without house numbers** are distributed across 2,506
  unique nearby residential-building candidates from 2GIS before gateway distances are calculated
- Eight gateway colors: solid dots have IDs; outlined dots do not
- **8 big-antenna tower sites** — click any tower (on the map or in the «Вышки» tab)
  to see its real street address, coordinates, 9 km coverage radius, and links to
  Google Maps / Yandex Maps
- Click any module dot to see its Module ID status, gateway, address, and distance
- Searchable mahalla list — click to isolate a neighborhood (everything else dims)
- Detailed **2GIS** vector map with buildings, streets, places, and traffic control
- Optional 9 km coverage-circle overlay · Export the module assignment to **CSV**
- Desktop: floating glass panel · Mobile: map-first with a swipeable bottom sheet

## Tech

- [2GIS MapGL JS API](https://docs.2gis.com/en/mapgl/overview/features) — detailed
  2GIS vector map, labels, buildings, places, traffic, and WebGL rendering
- Modules render as GeoJSON point layers (all 8,282 points); towers and mahalla
  centers are DOM markers
- Registry data is baked into `index.html`; the generated nearest-first assignment is
  stored in `assignment-data.js`

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The 2GIS browser API key is stored in `index.html`. Before publishing, restrict the
key to the production domain in 2GIS Platform Manager. The current key is a demo key
and the map will stop loading when its demo subscription expires.

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

## Data notes

- Rows with a known house number remain tightly scattered around their mapped address.
  Rows without a house number are placed one module per selected residential-building candidate.
- The assignment is a geographic planning estimate, not field-confirmed billing data.
- Two embedded Zarafshon house numbers were corrected, and one blank plus three zero
  module counts were corrected to one.
- The 30 missing-address rows use deterministic building selection within their mahalla
  area. Mahalla centers were corrected with named GeoNames localities and 2GIS
  streets/settlements; unmatched names retain the Register map coordinate. Public
  street/house labels and 2GIS building references are kept for audit.
- **~15% of mahallas** (marked `≈` in the UI) are placed approximately — geocoded to the
  neighborhood, not a precise coordinate.
- To refine to exact coordinates, supply real lat/lng for those addresses.

---

*Contains internal infrastructure data — keep this repository private.*
