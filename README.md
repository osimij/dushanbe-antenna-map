# Dushanbe Antenna Map — ЧДММ «Дилшод»

Interactive map of the **Dilshod** antenna registry in Dushanbe, Tajikistan.
A single self-contained web page — **no build step, no API keys, no billing**.

- **8,278 antennas** across **450 addresses** in **35 mahallas** (registry dated 01.05.24)
- Every antenna drawn as a dot, colored by mahalla
- **8 big-antenna tower sites** — click any tower (on the map or in the «Вышки» tab)
  to see its real street address, coordinates, 9 km coverage radius, and links to
  Google Maps / Yandex Maps
- Click any antenna dot to see the address behind it (mahalla, house/street, count)
- Searchable mahalla list — click to isolate a neighborhood (everything else dims)
- Three free basemaps: **Тёмная** (dark), **Улицы** (streets), **Спутник** (satellite)
- Optional 9 km coverage-circle overlay · Export the registry to **CSV**
- Desktop: floating glass panel · Mobile: map-first with a swipeable bottom sheet

## Tech

- [MapLibre GL JS](https://maplibre.org/) — free, open-source vector map renderer
  (smooth zoom/rotate, WebGL)
- [CARTO basemaps](https://carto.com/basemaps) (dark / streets vector tiles) and
  [Esri World Imagery](https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9) (satellite) — no key required
- Antennas render as a GeoJSON circle layer (all 8,278 points); towers and mahalla
  centers are DOM markers
- Registry data is baked into `index.html`; tower addresses reverse-geocoded once
  via OpenStreetMap Nominatim

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

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

- Positions are **mahalla-level**, not exact rooftops: each address's antennas are
  scattered tightly (~55 m) around its geocoded point.
- **~15% of mahallas** (marked `≈` in the UI) are placed approximately — geocoded to the
  neighborhood, not a precise coordinate.
- To refine to exact coordinates, supply real lat/lng for those addresses.

---

*Contains internal infrastructure data — keep this repository private.*
