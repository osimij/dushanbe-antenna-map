/* 2GIS MapGL background for the existing Leaflet overlays and touch controls. */
(function () {
  'use strict';
  const DgisLayer = L.Layer.extend({
    initialize(options) { L.setOptions(this, options); },
    onAdd(map) {
      this._host = L.DomUtil.create('div', 'dgis-background', map.getContainer());
      const center = map.getCenter();
      this._gl = new mapgl.Map(this._host, {
        key: this.options.key, center: [center.lng, center.lat], zoom: map.getZoom(),
        minZoom: 1, maxZoom: 22, lang: 'ru', pitch: 0, rotation: 0,
        zoomControl: false, scaleControl: false, trafficControl: false,
        copyright: 'topRight', controlsLayoutPadding: {top: 75, right: 10},
        disableDragging: true, disableZoomOnScroll: false,
        disablePitchByUserInteraction: false, disableRotationByUserInteraction: false,
      });
      this._canvas = this._gl.getCanvas();
      this._canvas.style.transformOrigin = '0 0';
      this._gl.once('idle', () => {
        if (!this._map) return;
        this._view = new window.DgisView(this);
        this.fire('load');
      });
      this._gl.on('error', e => {
        if (['invalidtilekey', 'styleloaderror', 'webglcontextlost'].includes(e.type)) {
          // Do not destroy the SDK in the middle of its own event dispatch.
          this._failure = setTimeout(() => { if (this._map) this.fire('error', {reason: e.type}); }, 0);
        }
      });
      this._sync();
    },
    getEvents() {
      return {move: this._sync, resize: this._resize, zoomanim: this._animateZoom, zoomend: this._finishZoom};
    },
    _sync() {
      if (!this._gl || this._zooming || this._fromNative) return;
      const center = this._map.getCenter();
      this._center = center;
      this._zoom = this._map.getZoom();
      // MapGL's zoom (not styleZoom) uses the same pixel scale as Leaflet.
      this._syncing = true;
      this._gl.setCenter([center.lng, center.lat], {animate: false});
      this._gl.setZoom(this._zoom, {animate: false});
      this._syncing = false;
    },
    _resize() { this._gl?.invalidateSize(); this._sync(); },
    _animateZoom(e) {
      if (!this._gl || this._view?.active) return;
      cancelAnimationFrame(this._frame);
      this._zooming = true;
      const map = this._map, scale = map.getZoomScale(e.zoom, this._zoom), half = map.getSize().divideBy(2);
      const offset = map.project(this._center, e.zoom).subtract(map.project(e.center, e.zoom))
        .add(half).subtract(half.multiplyBy(scale));
      this._canvas.style.transition = 'transform .25s cubic-bezier(0, 0, .25, 1)';
      L.DomUtil.setTransform(this._canvas, offset, scale);
    },
    _finishZoom() {
      if (!this._zooming) return;
      this._zooming = false;
      this._sync();
      // Let MapGL paint the new camera before removing Leaflet's zoom transform.
      this._frame = requestAnimationFrame(() => {
        if (!this._canvas) return;
        this._canvas.style.transition = '';
        this._canvas.style.transform = '';
      });
    },
    onRemove() {
      clearTimeout(this._failure);
      cancelAnimationFrame(this._frame);
      this._view?.destroy();
      this._gl?.destroy();
      this._host?.remove();
      this._gl = this._canvas = this._host = null;
    },
  });
  L.dgisLayer = options => new DgisLayer(options);
})();
