/* Google Maps JavaScript API supplies the background; module data stays in the app. */
(function () {
  'use strict';
  window.addMapBackground = function (map, { onError, onReady }) {
    let currentLayer, timeout, fallback = false, disposed = false;
    const status = L.control({position: 'topright'});
    const label = L.DomUtil.create('div', 'map-provider');
    label.setAttribute('role', 'status');
    status.onAdd = () => label;
    status.addTo(map);
    map.attributionControl?.addAttribution('<a href="./map-info.html" target="_blank" rel="noopener">Условия и конфиденциальность</a>');
    const setStatus = (text, provider) => {
      label.textContent = text;
      map.getContainer().dataset.mapProvider = provider;
    };

    function useOpenStreetMap(reason) {
      if (fallback || disposed) return;
      fallback = true;
      clearTimeout(timeout);
      if (currentLayer) map.removeLayer(currentLayer);
      map.getContainer().classList.remove('google-map-active');
      setStatus(reason, 'openstreetmap');
      currentLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19, maxZoom: 20, minZoom: 8,
        updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      });
      currentLayer.on('tileerror', () => onError('Не удалось загрузить улицы на карте. Проверьте подключение к интернету.'));
      currentLayer.on('load', () => {
        if (Object.values(currentLayer._tiles).every(({el}) => el.complete && el.naturalWidth)) onReady();
      });
      currentLayer.addTo(map);
    }

    const apiKey = (window.MAP_CONFIG?.googleMapsApiKey || '').trim();
    if (!apiKey) {
      useOpenStreetMap('OpenStreetMap · Google ещё не подключён');
      return;
    }
    setStatus('Подключение Google Maps…', 'loading');
    const failed = () => useOpenStreetMap('OpenStreetMap · Google временно недоступен');
    // Google calls this for invalid keys, billing problems and referrer restrictions.
    window.gm_authFailure = failed;
    window.initGoogleMapBackground = () => {
      if (fallback || disposed) return;
      try {
        currentLayer = L.gridLayer.googleMutant({
          type: 'roadmap', maxZoom: 20, minZoom: 8,
          updateWhenIdle: true, updateWhenZooming: false, keepBuffer: 1,
        });
        currentLayer.once('load', () => {
          if (fallback || disposed) return;
          clearTimeout(timeout);
          setStatus('Google Maps', 'google');
          onReady();
        });
        currentLayer.on('tileerror', failed);
        map.getContainer().classList.add('google-map-active');
        currentLayer.addTo(map);
      } catch (error) {
        console.warn('Google Maps could not start; using OpenStreetMap.');
        failed();
      }
    };
    const script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?' + new URLSearchParams({
      key: apiKey, loading: 'async', callback: 'initGoogleMapBackground',
      v: 'quarterly', language: 'ru', region: 'TJ',
    });
    script.async = true;
    script.onerror = failed;
    timeout = setTimeout(failed, 20000);
    map.once('unload', () => {disposed = true; clearTimeout(timeout);});
    document.head.appendChild(script);
  };
})();
