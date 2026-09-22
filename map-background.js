/* Normal browser tile loading and caching; no geocoding or module data is sent. */
(function () {
  window.addMapBackground = function (map, { onError, onReady }) {
    let currentLayer, yandexBrand;
    let usingFallback = false;

    function watch(layer, message) {
      layer.on('tileerror', () => onError(message));
      layer.on('load', () => {
        if (Object.values(layer._tiles).every(({ el }) => el.complete && el.naturalWidth)) onReady();
      });
      return layer;
    }

    function useOpenStreetMap() {
      if (usingFallback) return;
      usingFallback = true;
      if (currentLayer) map.removeLayer(currentLayer);
      if (yandexBrand) map.removeControl(yandexBrand);
      onReady();
      currentLayer = watch(L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19, maxZoom: 20, minZoom: 8,
        updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      }), 'Не удалось загрузить улицы на карте. Проверьте подключение к интернету.');
      currentLayer.addTo(map);
    }

    const apiKey = (window.MAP_CONFIG?.yandexTilesApiKey || '').trim();
    if (!apiKey) {
      useOpenStreetMap();
      return;
    }

    yandexBrand = L.control({ position: 'topright' });
    yandexBrand.onAdd = () => {
      const el = L.DomUtil.create('div', 'yandex-brand');
      el.innerHTML = '<a href="https://yandex.ru/maps/" target="_blank" rel="noopener" aria-label="Яндекс Карты"><img src="./assets/yandex-logo.svg" alt="Яндекс" /></a>'
        + '<a class="open-yandex" href="https://yandex.ru/maps/?ll=68.74,38.57&z=13" target="_blank" rel="noopener">Открыть в Картах ↗</a>';
      L.DomEvent.disableClickPropagation(el);
      return el;
    };
    yandexBrand.addTo(map);
    currentLayer = new L.YandexTiles(apiKey);
    // A missing, expired, or rejected key must not leave an empty map.
    currentLayer.once('tileerror', useOpenStreetMap);
    currentLayer.on('load', () => { if (!usingFallback) onReady(); });
    currentLayer.addTo(map);
  };
})();
