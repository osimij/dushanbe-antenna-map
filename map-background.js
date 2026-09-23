/* 2GIS MapGL supplies the background; module data stays in the app. */
(function () {
  'use strict';
  window.addMapBackground = function (map, { onError, onReady }) {
    let currentLayer, timeout, fallback = false, disposed = false, dgisFailure = '';
    const config = window.MAP_CONFIG || {};
    // Phones fetch tiles once a pan settles and keep a small buffer; desktops stream tiles while panning.
    const mobile = !!(window.L && L.Browser && L.Browser.mobile);
    const tileOptions = {updateWhenIdle: mobile, updateWhenZooming: false, keepBuffer: mobile ? 1 : 2};
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
    map.once('unload', () => {disposed = true; clearTimeout(timeout);});

    function useOpenStreetMap(reason) {
      if (fallback || disposed) return;
      fallback = true;
      clearTimeout(timeout);
      if (currentLayer) map.removeLayer(currentLayer);
      map.getContainer().classList.remove('google-map-active');
      setStatus(dgisFailure ? `OpenStreetMap · ${dgisFailure}` : reason, 'openstreetmap');
      currentLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 19, maxZoom: 20, minZoom: 8, ...tileOptions,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>',
      });
      currentLayer.on('tileerror', () => onError('Не удалось загрузить улицы на карте. Проверьте подключение к интернету.'));
      currentLayer.on('load', () => {
        if (Object.values(currentLayer._tiles).every(({el}) => el.complete && el.naturalWidth)) onReady();
      });
      currentLayer.addTo(map);
    }

    function useGoogle() {
      const apiKey = (config.googleMapsApiKey || '').trim();
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
            type: 'roadmap', maxZoom: 20, minZoom: 8, ...tileOptions,
          });
          currentLayer.once('load', () => {
            if (fallback || disposed) return;
            clearTimeout(timeout);
            setStatus(dgisFailure ? `Google Maps · ${dgisFailure}` : 'Google Maps', 'google');
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
      document.head.appendChild(script);
    }

    if (config.provider !== '2gis') { useGoogle(); return; }
    const key = (config.dgisApiKey || '').trim();
    let dgisStopped = false;
    function dgisFailed(reason) {
      if (dgisStopped || disposed) return;
      dgisStopped = true;
      clearTimeout(timeout);
      if (currentLayer) { map.removeLayer(currentLayer); currentLayer = null; }
      dgisFailure = reason === 'invalidtilekey' ? 'ключ 2GIS не принят' : '2GIS временно недоступен';
      useGoogle();
    }
    if (!key) { dgisFailed('invalidtilekey'); return; }
    setStatus('Подключение 2GIS…', 'loading');
    function startDgis() {
      if (dgisStopped || disposed) return;
      try {
        currentLayer = L.dgisLayer({key});
        currentLayer.once('load', () => {
          if (dgisStopped || disposed) return;
          clearTimeout(timeout);
          setStatus('2GIS', '2gis');
          onReady();
        });
        currentLayer.on('error', e => dgisFailed(e.reason));
        currentLayer.addTo(map);
      } catch (error) {
        console.warn('2GIS could not start; using a fallback map.');
        dgisFailed();
      }
    }
    timeout = setTimeout(() => dgisFailed(), 30000);
    if (window.mapgl) { startDgis(); return; }
    const script = document.createElement('script');
    script.src = 'https://mapgl.2gis.com/api/js/v1';
    script.async = true;
    script.onload = startDgis;
    script.onerror = () => dgisFailed();
    document.head.appendChild(script);
  };
})();
