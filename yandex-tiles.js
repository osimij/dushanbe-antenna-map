/* Yandex raster tiles for Leaflet. No JS API subscription is used.
   12 starts/second per open map leaves headroom for two simultaneous users
   under Yandex's 30 requests/second limit. More tabs share the same API quota. */
(function () {
  const START_INTERVAL_MS = 85;
  const TRANSPARENT_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
  L.YandexTiles = L.TileLayer.extend({
    initialize(apiKey) {
      L.TileLayer.prototype.initialize.call(this,
        'https://tiles.api-maps.yandex.ru/v1/tiles/?apikey=' + encodeURIComponent(apiKey)
        + '&lang=ru_RU&l=map&maptype=map&projection=web_mercator&x={x}&y={y}&z={z}', {
          maxZoom: 20, minZoom: 8, updateWhenIdle: true, updateWhenZooming: false,
          keepBuffer: 1, attribution: '<a href="https://yandex.ru/legal/maps_termsofuse/" target="_blank" rel="noopener">Условия использования</a>',
        });
      this._pending = [];
      this._lastStart = 0;
      this.on('tileunload', ({ tile }) => {
        tile._cancelled = true;
        tile.onload = tile.onerror = null;
        if (tile.hasAttribute('src')) tile.src = TRANSPARENT_TILE;
      });
    },
    createTile(coords, done) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.setAttribute('role', 'presentation');
      // Preserve the origin for Yandex's domain restrictions without sending page paths.
      tile.referrerPolicy = 'strict-origin-when-cross-origin';
      tile.onload = () => done(null, tile);
      tile.onerror = () => done(new Error('Yandex tile failed to load'), tile);
      this._pending.push({ tile, url: this.getTileUrl(coords) });
      this._schedule();
      return tile;
    },
    _schedule() {
      if (this._queueTimer || !this._pending.length) return;
      this._queueTimer = setTimeout(() => {
        this._queueTimer = null;
        let item;
        while (this._pending.length) {
          const next = this._pending.shift();
          if (!next.tile._cancelled) { item = next; break; }
        }
        if (item) {
          this._lastStart = performance.now();
          item.tile.src = item.url;
        }
        this._schedule();
      }, Math.max(0, START_INTERVAL_MS - (performance.now() - this._lastStart)));
    },
    onRemove(map) {
      clearTimeout(this._queueTimer);
      this._queueTimer = null;
      this._pending = [];
      L.TileLayer.prototype.onRemove.call(this, map);
    },
  });
})();
