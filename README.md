# Dushanbe Antenna Map — ЧДММ «Дилшод»

Interactive map of the **Dilshod** antenna registry in Dushanbe, Tajikistan.
A single self-contained web page — **no API key, no billing, no build step.**

- **8,278 antennas** across **450 addresses** in **35 mahallas** (registry dated 01.05.24)
- **Dots** view (every antenna, GPU-rendered) and **Heatmap** view of density
- Searchable mahalla list — click to isolate & zoom to a neighborhood
- Switchable base maps: **Voyager / Light / Dark / Satellite / OSM** (all free)
- Export the registry to **CSV**

## Tech

- [MapLibre GL JS](https://maplibre.org/) — camera & interaction (open-source)
- [deck.gl](https://deck.gl/) — GPU rendering of the base tiles + thousands of antenna points
- Free, keyless map tiles: **CARTO** basemaps, **Esri** World Imagery (satellite), **OpenStreetMap**

Everything is loaded from CDNs at runtime and the data is baked into `index.html`, so the
site is 100% static — nothing to install or configure.

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
