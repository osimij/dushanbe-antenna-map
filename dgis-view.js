/* Native 2GIS data overlays and camera controls for tilted/rotated views. */
(function () {
  'use strict';
  const coords = p => [p.lng, p.lat];
  const alpha = (color, opacity = 1) => color + Math.round(opacity * 255).toString(16).padStart(2, '0');
  const motion = () => ({animate: !matchMedia('(prefers-reduced-motion: reduce)').matches, duration: 300});
  window.DgisView = class {
    constructor(layer) {
      this.layer = layer; this.map = layer._map; this.gl = layer._gl;
      this.active = false; this.icons = new Map(); this.objects = new Map();
      this.handlers = new Map(); this.layers = new Map();
      this.pointLayers = new Set();
      // Leaflet must not close a native popup when its click bubbles upward.
      // Keep touchstart/mousedown bubbling: MapGL uses them for multi-touch gestures.
      layer._host._leaflet_disable_click = true;
      L.DomEvent.on(layer._host, 'click dblclick contextmenu', L.DomEvent.stopPropagation);
      this.control = L.control({position: 'bottomright'});
      this.control.onAdd = () => {
        const el = L.DomUtil.create('div', 'dgis-compass');
        el.innerHTML = '<button class="dgis-north" aria-label="Север сверху" title="Север сверху"><span>▲</span></button>'
          + '<button class="dgis-turn dgis-left" aria-label="Повернуть карту влево" title="Повернуть влево">‹</button>'
          + '<button class="dgis-tilt" aria-label="Включить 3D" aria-pressed="false">3D</button>'
          + '<button class="dgis-turn dgis-right" aria-label="Повернуть карту вправо" title="Повернуть вправо">›</button>'
          + '<span class="dgis-compass-help" role="tooltip">Чтобы вращать карту, зажмите Ctrl и перетаскивайте мышью. На телефоне — поверните карту двумя пальцами.</span>';
        L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
        el.querySelector('.dgis-tilt').onclick = () => this.gl.getPitch() > 1 ? this.reset() : this.tilt();
        el.querySelector('.dgis-north').onclick = () => { if (this.active) this.gl.setRotation(0, motion()); };
        el.querySelector('.dgis-left').onclick = () => this.rotate(-30);
        el.querySelector('.dgis-right').onclick = () => this.rotate(30);
        this.el = el;
        return el;
      };
      this.control.addTo(this.map);
      this.refresh = () => {
        if (!this.active || this.refreshFrame) return;
        this.refreshFrame = requestAnimationFrame(() => { this.refreshFrame = 0; if (this.active) this.draw(); });
      };
      this.map.on('layeradd layerremove zoomend datachange', this.refresh);
      this.moveEnd = () => {
        this.updateControl();
        if (!this.active || this.layer._syncing || this.layer._fromNative) return;
        this.layer._fromNative = true;
        this.map.setView(L.latLng(this.gl.getCenter().slice().reverse()), this.gl.getZoom(), {animate: false});
        this.layer._fromNative = false;
        this.refresh();
      };
      this.gl.on('moveend', this.moveEnd);
      this.rotateMove = () => this.updateControl();
      this.gl.on('rotation', this.rotateMove);
      this.click = e => {
        if (!this.active) return;
        const target = e.targetData;
        const leaflet = target?.source === this.source ? this.layers.get(Number(target.feature?.properties.leafletId)) : null;
        const latlng = L.latLng(e.lngLat.slice().reverse());
        if (leaflet) leaflet.fire('click', {latlng, originalEvent: e.originalEvent}, true);
        else this.map.fire('click', {latlng, originalEvent: e.originalEvent});
      };
      this.gl.on('click', this.click);
      this.ctrlDrag = e => {
        if (this.active || !e.ctrlKey || e.button !== 0 || e.target.closest('.leaflet-control, a, button')) return;
        this.enter();
        e.preventDefault(); e.stopImmediatePropagation();
        this.gl.getCanvas().dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, button: 0, buttons: 1, ctrlKey: true,
          clientX: e.clientX, clientY: e.clientY,
        }));
      };
      this.map.getContainer().addEventListener('mousedown', this.ctrlDrag, true);
      this.map.dgisView = this;
    }
    updateControl() {
      if (!this.el) return;
      const tilted = this.gl.getPitch() > 1;
      const button = this.el.querySelector('.dgis-tilt');
      button.textContent = tilted ? '2D' : '3D';
      button.setAttribute('aria-pressed', String(tilted));
      button.setAttribute('aria-label', tilted ? 'Вернуться к 2D' : 'Включить 3D');
      this.el.querySelector('.dgis-north span').style.transform = `rotate(${-this.gl.getRotation()}deg)`;
    }
    enter() {
      if (this.active) return;
      this.map.stop();
      this.layer._finishZoom();
      this.layer._sync();
      this.active = true;
      for (const name of ['dragging', 'scrollWheelZoom', 'doubleClickZoom', 'touchZoom', 'boxZoom', 'keyboard']) {
        const h = this.map[name];
        if (h?.enabled()) { this.handlers.set(name, h); h.disable(); }
      }
      this.map.getContainer().classList.add('dgis-interactive');
      this.gl.setOption('disableDragging', false);
      this.draw();
    }
    tilt() { this.enter(); this.gl.setPitch(45, motion()); this.updateControl(); }
    rotate(delta) { this.enter(); this.gl.setRotation(this.gl.getRotation() + delta, motion()); }
    reset() {
      if (!this.active) return;
      // Restore the same geographical view before handing gestures back to Leaflet.
      this.layer._fromNative = true;
      this.gl.setPitch(0, {animate: false}); this.gl.setRotation(0, {animate: false});
      this.gl.setPadding({top: 0, right: 0, bottom: 0, left: 0}, {animate: false});
      this.map.setView(L.latLng(this.gl.getCenter().slice().reverse()), this.gl.getZoom(), {animate: false});
      this.layer._fromNative = false;
      this.active = false;
      this.clear();
      this.gl.setOption('disableDragging', true);
      this.map.getContainer().classList.remove('dgis-interactive');
      for (const h of this.handlers.values()) h.enable();
      this.handlers.clear();
      this.layer._sync();
      this.updateControl();
    }
    focus(latlng, zoom, area) {
      const size = this.map.getSize();
      this.gl.setPadding({left: area.left, top: area.top, right: size.x - area.right, bottom: size.y - area.bottom}, motion());
      this.gl.setCenter(coords(latlng), motion()); this.gl.setZoom(zoom, motion());
    }
    project(latlng) { return this.gl.project(coords(latlng)); }
    icon(layer) {
      const o = layer.options, radius = layer.getRadius(), selected = !!layer.selected;
      const label = this.gl.getZoom() >= 16 && layer.group ? String(layer.group.modules.length) : '';
      const key = [o.fillColor, o.color, o.fillOpacity, o.weight, selected, label].join('|');
      if (!this.icons.has(key)) {
        const name = 'module-dot-' + this.icons.size;
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">'
          + (selected ? '<circle cx="32" cy="32" r="31" fill="#007aff" fill-opacity=".28"/>' : '')
          + `<circle cx="32" cy="32" r="${selected ? 22 : 29}" fill="${o.fillColor}" fill-opacity="${o.fillOpacity}" stroke="${o.color}" stroke-width="${o.weight * 2}"/>`
          + (label ? `<text x="32" y="33" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-size="23" font-weight="600" fill="white">${label}</text>` : '') + '</svg>';
        this.gl.addIcon(name, {url: 'data:image/svg+xml;base64,' + btoa(svg)});
        this.icons.set(key, name);
      }
      return {icon: this.icons.get(key), width: Math.max(3, radius * 2 + (selected ? 12 : 2))};
    }
    draw() {
      if (!this.active) return;
      const features = [], keep = new Set();
      this.layers.clear();
      this.map.eachLayer(layer => {
        const id = L.stamp(layer);
        if (layer instanceof L.CircleMarker && !(layer instanceof L.Circle)) {
          this.layers.set(id, layer);
          features.push({type: 'Feature', geometry: {type: 'Point', coordinates: coords(layer.getLatLng())},
            properties: {leafletId: id, ...this.icon(layer)}});
        } else if (layer instanceof L.Marker || layer instanceof L.Circle || layer instanceof L.Polygon || layer instanceof L.Popup) {
          keep.add(id);
          if (!this.objects.has(id)) this.objects.set(id, this.mirror(layer));
        }
      });
      for (const [id, object] of this.objects) if (!keep.has(id)) { object?.destroy(); this.objects.delete(id); }
      const data = {type: 'FeatureCollection', features};
      if (!this.source) {
        this.source = new mapgl.GeoJsonSource(this.gl, {data, attributes: {purpose: 'module-overlay'}});
      } else this.source.setData(data).catch(error => console.warn('Could not update 3D markers.', error));
      // Keep icon names literal so MapGL registers each image in its icon atlas.
      // All buildings still share one source; identical dots share one style layer.
      const wanted = new Set();
      for (const {properties: {icon, width}} of features) {
        const id = 'module-overlay-' + icon + '-' + width;
        wanted.add(id);
        if (this.pointLayers.has(id)) continue;
        this.gl.addLayer({id, type: 'point', interactive: true,
          filter: ['all', ['match', ['sourceAttr', 'purpose'], ['module-overlay'], true, false],
            ['==', ['get', 'icon'], icon], ['==', ['get', 'width'], width]],
          style: {iconImage: icon, iconWidth: width, allowOverlap: true}});
        this.pointLayers.add(id);
      }
      for (const id of this.pointLayers) if (!wanted.has(id)) { this.gl.removeLayer(id); this.pointLayers.delete(id); }
    }
    mirror(layer) {
      const o = layer.options;
      if (layer instanceof L.Circle) return new mapgl.Circle(this.gl, {
        coordinates: coords(layer.getLatLng()), radius: layer.getRadius(),
        color: alpha(o.fillColor || o.color, o.fillOpacity), strokeColor: alpha(o.color, o.opacity),
        strokeWidth: o.weight, interactive: false, zIndex: 1,
      });
      if (layer instanceof L.Polygon) return new mapgl.Polygon(this.gl, {
        coordinates: layer.toGeoJSON().geometry.coordinates,
        color: alpha(o.fillColor || o.color, o.fillOpacity), strokeColor: alpha(o.color, o.opacity),
        strokeWidth: o.weight, interactive: false, zIndex: 2,
      });
      const el = document.createElement('div');
      let anchor = [0, 0];
      if (layer instanceof L.Popup) {
        el.className = 'dgis-native-popup';
        const content = layer.getContent();
        if (typeof content === 'string') el.innerHTML = content;
        else el.appendChild(content.cloneNode(true));
        let close = el.querySelector('.popup-close');
        if (!close) { close = document.createElement('button'); close.className = 'popup-close'; close.textContent = '×'; close.setAttribute('aria-label', 'Закрыть'); el.appendChild(close); }
        close.onclick = e => { e.stopPropagation(); layer.remove(); };
      } else {
        const original = layer.getElement();
        el.className = original.className.replace(/leaflet-[\w-]+/g, '').trim();
        el.innerHTML = original.innerHTML;
        const size = o.icon.options.iconSize;
        if (size) { el.style.width = size[0] + 'px'; el.style.height = size[1] + 'px'; }
        anchor = o.icon.options.iconAnchor || [0, 0];
        el.title = o.title || '';
        el.setAttribute('role', 'button'); el.tabIndex = 0;
        const click = e => {
          e.stopPropagation();
          (original.firstElementChild || original).dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
        };
        el.onclick = click;
        el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); click(e); } };
      }
      return new mapgl.HtmlMarker(this.gl, {coordinates: coords(layer.getLatLng()), html: el, anchor,
        zIndex: layer instanceof L.Popup ? 10000 : (o.zIndexOffset || 1000), interactive: true});
    }
    clear() {
      cancelAnimationFrame(this.refreshFrame); this.refreshFrame = 0;
      for (const object of this.objects.values()) object?.destroy();
      this.objects.clear(); this.layers.clear();
      for (const id of this.pointLayers) this.gl.removeLayer(id);
      this.pointLayers.clear();
      if (this.source) { this.source.destroy(); this.source = null; }
    }
    destroy() {
      this.reset(); this.clear();
      this.map.off('layeradd layerremove zoomend datachange', this.refresh);
      this.gl.off('moveend', this.moveEnd); this.gl.off('rotation', this.rotateMove); this.gl.off('click', this.click);
      this.map.getContainer().removeEventListener('mousedown', this.ctrlDrag, true);
      this.control.remove(); delete this.map.dgisView;
    }
  };
})();
